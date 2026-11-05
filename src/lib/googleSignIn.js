const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const PENDING_KEY = 'moodbot:google-pending'

export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

const redirectUri = () => `${window.location.origin}${import.meta.env.BASE_URL}`

const randomText = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/[+/=]/g, '')

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function startGoogle(intent = 'signin') {
  const nonce = randomText()
  const state = randomText()
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ nonce, state, intent }))
  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri(),
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: await sha256(nonce),
    state,
    prompt: 'select_account',
  })
  window.location.assign(`${AUTH_URL}?${params}`)
}

export function takeGoogleResult() {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  if (!hash.has('state') || !(hash.has('id_token') || hash.has('error'))) return null
  window.history.replaceState(null, '', window.location.pathname + window.location.search)

  let pending
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY))
  } catch {
    pending = null
  }
  sessionStorage.removeItem(PENDING_KEY)

  if (!pending || pending.state !== hash.get('state')) return { error: 'Google sign in expired. Try again.' }
  if (hash.has('error')) return { error: hash.get('error') === 'access_denied' ? '' : 'Google sign in didn’t finish. Try again.' }
  return { token: hash.get('id_token'), nonce: pending.nonce, intent: pending.intent }
}
