import { AUTH_URL, GOOGLE_CLIENT_ID } from '../config'

// Google sign-in for the browser (Google Identity Services).
// Access tokens last about an hour; we keep the current one in localStorage so a
// reload doesn't need a new sign-in. With the sign-in helper (AUTH_URL) the first
// sign-in also gives a "session" (an encrypted refresh token only the helper can
// read), and later tokens come from the helper without any popup. Without it, a
// new token needs a short popup, which browsers only allow right after a tap.

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const TOKEN_KEY = 'rail-planner:google-token'
const SESSION_KEY = 'rail-planner:google-session'
const POPUP_CLOSED = 'Sign-in window was closed'

interface CodeClient {
  requestCode: () => void
}
interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
}
interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (r: TokenResponse) => void
            error_callback?: (e: { type: string }) => void
          }) => TokenClient
          initCodeClient: (config: {
            client_id: string
            scope: string
            ux_mode: 'popup'
            callback: (r: { code?: string; error?: string }) => void
            error_callback?: (e: { type: string }) => void
          }) => CodeClient
          revoke: (token: string, done?: () => void) => void
        }
      }
    }
  }
}

let gisLoading: Promise<void> | null = null

function loadGis() {
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisLoading = null
      reject(new Error('Could not load Google sign-in (offline?)'))
    }
    document.head.appendChild(s)
  })
  return gisLoading
}

export const isConfigured = () => GOOGLE_CLIENT_ID !== ''

/** A still-valid token, if we have one */
export function currentToken(): string | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null')
    // Treat tokens as expired a minute early
    if (t?.token && t.expires > Date.now() + 60_000) return t.token
  } catch {
    /* none */
  }
  return null
}

export function forgetToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable */
  }
}

function keepToken(token: string, expiresIn = 3600) {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expires: Date.now() + expiresIn * 1000 }))
  } catch {
    /* storage unavailable: token still works for this session */
  }
}

/** The lasting sign-in from the helper, if this device has one */
export function session() {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function setSession(s: string | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, s)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* storage unavailable */
  }
}

interface HelperReply {
  access_token?: string
  expires_in?: number
  session?: string | null
  error?: string
}

async function helper(path: string, body: unknown) {
  const res = await fetch(AUTH_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as HelperReply }
}

/** A fresh token without any popup, through the sign-in helper; null if that's not possible */
export async function silentToken(): Promise<string | null> {
  const s = session()
  if (!AUTH_URL || !s) return null
  try {
    const r = await helper('/refresh', { session: s })
    // Access was removed (or the session ended): the next sign-in starts a new one
    if (r.status === 401) setSession(null)
    if (!r.body.access_token) return null
    keepToken(r.body.access_token, r.body.expires_in)
    return r.body.access_token
  } catch {
    return null // offline, or the helper is down
  }
}

/** A valid token: the stored one, else a silent renewal */
export async function validToken(): Promise<string | null> {
  return currentToken() ?? (await silentToken())
}

/** Ask Google for a token. Must run right after a user tap (it may open a popup). */
export async function requestToken(firstTime: boolean): Promise<string> {
  await loadGis()
  if (AUTH_URL) {
    try {
      return await requestWithHelper()
    } catch (e) {
      // Window closed: don't ask twice. Helper down: the hourly way below still works
      if ((e as Error).message === POPUP_CLOSED) throw e
    }
  }
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) {
          reject(new Error(r.error || 'Sign-in failed'))
          return
        }
        keepToken(r.access_token, r.expires_in)
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? POPUP_CLOSED : 'Sign-in failed')),
    })
    client.requestAccessToken({ prompt: firstTime ? 'consent' : '' })
  })
}

/** Sign in with a one-time code, which the helper trades for a token and a lasting session */
function requestWithHelper(): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      ux_mode: 'popup',
      callback: async (r) => {
        if (!r.code) {
          reject(new Error(r.error || 'Sign-in failed'))
          return
        }
        try {
          const x = await helper('/exchange', { code: r.code })
          if (!x.body.access_token) throw new Error(x.body.error || 'Sign-in failed')
          keepToken(x.body.access_token, x.body.expires_in)
          if (x.body.session) setSession(x.body.session)
          resolve(x.body.access_token)
        } catch (e) {
          reject(e)
        }
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? POPUP_CLOSED : 'Sign-in failed')),
    })
    client.requestCode()
  })
}

export async function revoke() {
  const token = currentToken()
  const s = session()
  forgetToken()
  setSession(null)
  if (AUTH_URL && s) await helper('/revoke', { session: s }).catch(() => {})
  if (!token) return
  try {
    await loadGis()
    window.google!.accounts.oauth2.revoke(token)
  } catch {
    /* offline: the token simply expires */
  }
}
