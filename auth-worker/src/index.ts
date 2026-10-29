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

interface Env {
  GOOGLE_CLIENT_ID: string
  /** Secret (wrangler secret put GOOGLE_CLIENT_SECRET) */
  GOOGLE_CLIENT_SECRET: string
  /** Secret: 32 random bytes, base64 (wrangler secret put SESSION_KEY) */
  SESSION_KEY: string
  /** Comma-separated origins allowed to call this Worker */
  ALLOWED_ORIGINS: string
}

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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? ''
    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403 })
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    }
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
    if (req.method !== 'POST') return reply({ error: 'method' }, 405)

    let input: { code?: string; session?: string }
    try {
      input = await req.json()
    } catch {
      return reply({ error: 'bad_request' }, 400)
    }
    const path = new URL(req.url).pathname

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
