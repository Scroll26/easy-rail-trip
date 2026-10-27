import { GOOGLE_CLIENT_ID } from '../config'

// Google sign-in for the browser (Google Identity Services, token model).
// Access tokens last about an hour; we keep the current one in localStorage so a
// reload doesn't need a new sign-in. Getting a new token opens a short popup,
// which browsers only allow right after a tap, so that path is "interactive".

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const TOKEN_KEY = 'rail-planner:google-token'

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

/** Ask Google for a token. Must run right after a user tap (it may open a popup). */
export async function requestToken(firstTime: boolean): Promise<string> {
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) {
          reject(new Error(r.error || 'Sign-in failed'))
          return
        }
        try {
          localStorage.setItem(
            TOKEN_KEY,
            JSON.stringify({ token: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 }),
          )
        } catch {
          /* storage unavailable: token still works for this session */
        }
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Sign-in window was closed' : 'Sign-in failed')),
    })
    client.requestAccessToken({ prompt: firstTime ? 'consent' : '' })
  })
}

export async function revoke() {
  const token = currentToken()
  forgetToken()
  if (!token) return
  try {
    await loadGis()
    window.google!.accounts.oauth2.revoke(token)
  } catch {
    /* offline: the token simply expires */
  }
}
