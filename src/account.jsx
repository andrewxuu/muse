import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { cloudPush, pullCloud, pushAll, setSyncUser } from './lib/cloudSync'
import { DONE_KEY, GUEST_KEY, PROVIDER_KEY, STEP_KEY, SYNCED_KEYS, readKey, removeKey, writeKey } from './lib/storageKeys'
import { hasToken, login as connectSpotify } from './spotify/auth'
import { googleClientId, startGoogle, takeGoogleResult } from './lib/googleSignIn'

const AccountContext = createContext(null)

const redirectUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`

const readOAuthError = () => {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search)
  return params.get('error_description') ?? ''
}

let googleDone = null

const completeGoogle = () => {
  googleDone ??= (async () => {
    const google = takeGoogleResult()
    if (!google) return null
    if (!google.token) return { error: google.error }
    const { data } = await supabase.auth.getSession()
    const credentials = { provider: 'google', token: google.token, nonce: google.nonce }
    const linking = google.intent === 'link' && data.session
    const { error } = linking ? await supabase.auth.linkIdentity(credentials) : await supabase.auth.signInWithIdToken(credentials)
    if (error) return { error: error.message }
    return { provider: linking ? null : 'google', refresh: true }
  })()
  return googleDone
}

export function AccountProvider({ children }) {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(!supabase)
  const [guest, setGuest] = useState(() => readKey(GUEST_KEY) === '1')
  const [onboarded, setOnboarded] = useState(() => readKey(DONE_KEY) === '1')
  const [replay, setReplay] = useState(false)
  const [oauthError, setOauthError] = useState(readOAuthError)

  useEffect(() => {
    if (!supabase) return
    let live = true
    if (readOAuthError()) window.history.replaceState(null, '', window.location.pathname)

    const start = async () => {
      let current = null
      let chainSpotify = false
      let provider = readKey(PROVIDER_KEY)
      try {
        const google = await completeGoogle()
        if (google?.error && live) setOauthError(google.error)
        if (google?.provider) provider = google.provider
        const { data } = await supabase.auth.getSession()
        current = data.session
        if (current && google?.refresh) {
          const { data: me } = await supabase.auth.getUser()
          if (me?.user) current = { ...current, user: me.user }
        }
        if (current) {
          await pullCloud(current.user.id).catch(() => {})
          setSyncUser(current.user.id)
          if (provider && live) {
            const done = readKey(DONE_KEY) === '1'
            if (!done) writeKey(STEP_KEY, provider === 'spotify' ? 'genres' : 'spotify')
            removeKey(GUEST_KEY)
            setGuest(false)
            setOnboarded(done)
            chainSpotify = provider === 'spotify' && !hasToken()
          }
        }
      } finally {
        if (live) {
          removeKey(PROVIDER_KEY)
          setSession(current)
          setReady(true)
        }
      }
      if (chainSpotify && live) connectSpotify().catch(() => {})
    }
    start()

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') setSession(null)
      if (event === 'TOKEN_REFRESHED') setSession(next)
    })
    return () => {
      live = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(async ({ name, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      },
    })
    if (error) throw error
    if (!data.session) return { needsConfirm: true }
    setSyncUser(data.user.id)
    await pushAll(data.user.id).catch(() => {})
    removeKey(GUEST_KEY)
    removeKey(DONE_KEY)
    writeKey(STEP_KEY, 'spotify')
    setOnboarded(false)
    setGuest(false)
    setSession(data.session)
    return { needsConfirm: false }
  }, [])

  const signIn = useCallback(async ({ email, password, markOnboarded = true }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await pullCloud(data.user.id).catch(() => {})
    setSyncUser(data.user.id)
    if (markOnboarded) {
      writeKey(DONE_KEY, '1')
      removeKey(STEP_KEY)
      setOnboarded(true)
    }
    removeKey(GUEST_KEY)
    setGuest(false)
    setSession(data.session)
  }, [])

  const signInWithProvider = useCallback(async (provider) => {
    if (!supabase) throw new Error('Accounts aren’t set up yet. Add your Supabase keys to .env.local.')
    setOauthError('')
    if (provider === 'google' && googleClientId) return startGoogle('signin')
    writeKey(PROVIDER_KEY, provider)
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectUrl() } })
    if (error) {
      removeKey(PROVIDER_KEY)
      throw error
    }
  }, [])

  const linkProvider = useCallback(async (provider) => {
    if (provider === 'google' && googleClientId) return startGoogle('link')
    const { error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo: redirectUrl() } })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (supabase && session) {
      await supabase.auth.signOut()
      SYNCED_KEYS.forEach(removeKey)
    }
    setSyncUser(null)
    removeKey(GUEST_KEY)
    window.location.assign(import.meta.env.BASE_URL)
  }, [session])

  const continueAsGuest = useCallback(() => {
    removeKey(DONE_KEY)
    removeKey(STEP_KEY)
    writeKey(GUEST_KEY, '1')
    setOnboarded(false)
    setGuest(true)
  }, [])

  const finishOnboarding = useCallback(() => {
    writeKey(DONE_KEY, '1')
    cloudPush('onboarded', true)
    removeKey(STEP_KEY)
    setOnboarded(true)
    setReplay(false)
  }, [])

  const startReplay = useCallback(() => {
    removeKey(STEP_KEY)
    setReplay(true)
  }, [])

  const user = session?.user ?? null
  const value = useMemo(
    () => ({
      ready,
      enabled: Boolean(supabase),
      user,
      name: user?.user_metadata?.name ?? null,
      guest,
      onboarded,
      replay,
      oauthError,
      providers: user?.identities?.map((i) => i.provider) ?? [],
      signUp,
      signIn,
      signInWithProvider,
      linkProvider,
      signOut,
      continueAsGuest,
      finishOnboarding,
      startReplay,
    }),
    [ready, user, guest, onboarded, replay, oauthError, signUp, signIn, signInWithProvider, linkProvider, signOut, continueAsGuest, finishOnboarding, startReplay]
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount() {
  return useContext(AccountContext)
}
