// OAuth client ID of the "Rail Planner" Google Cloud project (type: Web application).
// Client IDs are public by design; it only works from the origins registered for it.
// Leave empty to hide Google Drive sync.
export const GOOGLE_CLIENT_ID: string = '149234052907-hsh8qhno1qqsma48qp7kje9omtuiaor8.apps.googleusercontent.com'

// Sign-in helper (Cloudflare Worker in auth-worker/) that keeps you signed in to Google
// Drive. Leave empty to fall back to hourly sign-in popups.
export const AUTH_URL: string = 'https://rail-planner-auth.railplanner.workers.dev'
