// Rail Planner sign-in helper (Cloudflare Worker).
//
// Browser-only apps get Google access tokens that last an hour, and a new one needs a
// popup. This Worker holds the OAuth client secret, so it can trade the one-time sign-in
// code for a refresh token and later turn that into fresh access tokens without a popup.
// The refresh token goes back to the app encrypted with a key only this Worker knows,
// so nothing is stored here. The app only asks for Drive's hidden app folder.
//
// POST /exchange { code }    → { access_token, expires_in, session }
// POST /refresh  { session } → { access_token, expires_in }
// POST /revoke   { session } → {}
//
// It also keeps shared trips (read-only snapshot links), in Workers KV. Each one is
// deleted automatically a year after it was last updated.
// POST   /share          { session, data } → { id, key }   (signed-in users only)
// GET    /share/<id>                       → the shared trip
// PUT    /share/<id>     { key, data }     → {}             (key = the edit key from POST)
// DELETE /share/<id>     { key }           → {}

interface Env {
  GOOGLE_CLIENT_ID: string
  /** Secret (wrangler secret put GOOGLE_CLIENT_SECRET) */
  GOOGLE_CLIENT_SECRET: string
  /** Secret: 32 random bytes, base64 (wrangler secret put SESSION_KEY) */
  SESSION_KEY: string
  /** Comma-separated origins allowed to call this Worker */
  ALLOWED_ORIGINS: string
  /** Shared trips (wrangler kv namespace create SHARES --binding SHARES --update-config) */
  SHARES?: KVNamespace
}

/** The parts of Workers KV used here */
interface KVNamespace {
  get(key: string): Promise<string | null>
  getWithMetadata<M>(key: string): Promise<{ value: string | null; metadata: M | null }>
  put(key: string, value: string, options?: { metadata?: unknown; expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

/** Largest shared trip we keep */
const MAX_SHARE = 1_000_000
/** Shared trips are deleted this long after their last update (12 months) */
const SHARE_TTL = 365 * 24 * 60 * 60

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

const key = (env: Env) =>
  crypto.subtle.importKey('raw', Uint8Array.from(atob(env.SESSION_KEY), (c) => c.charCodeAt(0)), 'AES-GCM', false, ['encrypt', 'decrypt'])

async function seal(env: Env, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), new TextEncoder().encode(text)))
  return b64(iv) + '.' + b64(data)
}

async function open(env: Env, session: string) {
  const [iv, data] = session.split('.')
  if (!iv || !data) throw new Error('bad session')
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(env), unb64(data)))
}

async function google(env: Env, params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const sha256 = async (text: string) =>
  b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))

function randomId(n: number) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => chars[x % chars.length]).join('')
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? ''
    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403 })
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    }
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
    const path = new URL(req.url).pathname
    if (path === '/share' || path.startsWith('/share/')) return shares(req, env, path.slice(7), reply)
    if (req.method !== 'POST') return reply({ error: 'method' }, 405)

    let input: { code?: string; session?: string }
    try {
      input = await req.json()
    } catch {
      return reply({ error: 'bad_request' }, 400)
    }

    if (path === '/exchange' && input.code) {
      // "postmessage" = the code came from Google's sign-in popup
      const r = await google(env, { code: input.code, grant_type: 'authorization_code', redirect_uri: 'postmessage' })
      if (r.status !== 200) return reply({ error: r.body.error ?? 'exchange_failed' }, 400)
      return reply({
        access_token: r.body.access_token,
        expires_in: r.body.expires_in,
        session: typeof r.body.refresh_token === 'string' ? await seal(env, r.body.refresh_token) : null,
      })
    }

    if ((path === '/refresh' || path === '/revoke') && input.session) {
      let refresh: string
      try {
        refresh = await open(env, input.session)
      } catch {
        return reply({ error: 'invalid_grant' }, 401)
      }
      if (path === '/revoke') {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refresh }),
        })
        return reply({})
      }
      const r = await google(env, { refresh_token: refresh, grant_type: 'refresh_token' })
      // invalid_grant: signed out at Google, access removed, or the token expired
      if (r.status !== 200) return reply({ error: r.body.error ?? 'refresh_failed' }, r.body.error === 'invalid_grant' ? 401 : 502)
      return reply({ access_token: r.body.access_token, expires_in: r.body.expires_in })
    }

    return reply({ error: 'not_found' }, 404)
  },
}

async function shares(req: Request, env: Env, id: string, reply: (body: unknown, status?: number) => Response) {
  const kv = env.SHARES
  if (!kv) return reply({ error: 'sharing_off' }, 503)
  if (req.method === 'GET') {
    const data = id && (await kv.get(id))
    return data ? reply(JSON.parse(data)) : reply({ error: 'not_found' }, 404)
  }
  const text = await req.text()
  if (text.length > MAX_SHARE) return reply({ error: 'too_large' }, 413)
  let input: { session?: string; key?: string; data?: unknown }
  try {
    input = JSON.parse(text)
  } catch {
    return reply({ error: 'bad_request' }, 400)
  }

  if (req.method === 'POST' && !id) {
    // Only people signed in through this helper can create links (keeps strangers from filling it up)
    try {
      await open(env, input.session ?? '')
    } catch {
      return reply({ error: 'invalid_grant' }, 401)
    }
    if (!input.data) return reply({ error: 'bad_request' }, 400)
    const newId = randomId(10)
    const key = b64(crypto.getRandomValues(new Uint8Array(24)))
    await kv.put(newId, JSON.stringify(input.data), { metadata: { key: await sha256(key) }, expirationTtl: SHARE_TTL })
    return reply({ id: newId, key })
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && id) {
    const { metadata } = await kv.getWithMetadata<{ key: string }>(id)
    if (!metadata) return reply({ error: 'not_found' }, 404)
    if (!input.key || (await sha256(input.key)) !== metadata.key) return reply({ error: 'forbidden' }, 403)
    if (req.method === 'DELETE') await kv.delete(id)
    else if (input.data) await kv.put(id, JSON.stringify(input.data), { metadata, expirationTtl: SHARE_TTL })
    else return reply({ error: 'bad_request' }, 400)
    return reply({})
  }

  return reply({ error: 'method' }, 405)
}
