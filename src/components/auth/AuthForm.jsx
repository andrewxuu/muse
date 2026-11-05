import { useState } from 'react'
import { useAccount } from '../../account'
import Logo from '../ui/Logo'
import SocialButtons from './SocialButtons'

const primary = 'h-11 w-full rounded-[14px] bg-teal px-5 text-[15px] font-semibold text-white disabled:opacity-60'
const secondary = 'h-11 w-full rounded-[14px] border border-line px-5 text-[15px] font-semibold hover:border-teal'

function Field({ label, type = 'text', value, onChange, autoComplete, placeholder }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="h-11 w-full rounded-[12px] border border-line bg-cream px-3.5 text-[15px] outline-none placeholder:text-hint focus:border-teal"
      />
    </label>
  )
}

export default function AuthForm({ initialMode = 'create', onDone }) {
  const { enabled, oauthError, signUp, signIn, continueAsGuest } = useAccount()
  const [mode, setMode] = useState(initialMode)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [signedUp, setSignedUp] = useState(false)
  const creating = mode === 'create'

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const switchMode = () => {
    setMode(creating ? 'login' : 'create')
    setError('')
    setNotice('')
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!enabled) return setError('Accounts aren’t set up yet. Add your Supabase keys to .env.local.')
    if (creating && !form.name.trim()) return setError('Enter your name.')
    if (!form.email.includes('@')) return setError('Enter a valid email.')
    if (creating && form.password.length < 8) return setError('Your password needs at least 8 characters.')
    if (!creating && !form.password) return setError('Enter your password.')

    setBusy(true)
    try {
      if (creating) {
        const result = await signUp(form)
        if (result.needsConfirm) {
          setSignedUp(true)
          setMode('login')
          setNotice('Check your email to confirm your account, then log in.')
          return
        }
      } else {
        await signIn({ ...form, markOnboarded: !signedUp })
      }
      onDone?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const guest = () => {
    continueAsGuest()
    onDone?.()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Logo size={64} className="mb-2" />
        <h1 className="font-serif text-[28px] font-semibold sm:text-[32px]">{creating ? 'Create your account' : 'Welcome back'}</h1>
        <p className="text-[15px] text-muted">
          {creating ? 'Save your songs, moods, and genres on every device.' : 'Log in to pick up where you left off.'}
        </p>
      </div>

      {notice && (
        <p role="status" className="rounded-[12px] bg-teal-soft px-3.5 py-2.5 text-[14px] text-teal">
          {notice}
        </p>
      )}

      <SocialButtons onError={setError} />

      {creating && <Field label="Name" value={form.name} onChange={set('name')} autoComplete="name" placeholder="Your name" />}
      <Field label="Email" type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@email.com" />
      <Field
        label="Password"
        type="password"
        value={form.password}
        onChange={set('password')}
        autoComplete={creating ? 'new-password' : 'current-password'}
        placeholder={creating ? '8+ characters' : 'Your password'}
      />

      {(error || oauthError) && (
        <p role="alert" className="text-[14px] text-danger">
          {error || oauthError}
        </p>
      )}

      <button type="submit" disabled={busy} className={primary}>
        {busy ? 'One moment…' : creating ? 'Create account' : 'Log in'}
      </button>
      {creating && (
        <button type="button" onClick={guest} className={secondary}>
          Continue as guest
        </button>
      )}

      <p className="text-center text-[14px] text-muted">
        {creating ? 'Already have an account? ' : 'New here? '}
        <button type="button" onClick={switchMode} className="font-semibold text-teal">
          {creating ? 'Log in' : 'Create account'}
        </button>
      </p>
    </form>
  )
}
