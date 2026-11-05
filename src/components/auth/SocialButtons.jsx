import { useState } from 'react'
import { useAccount } from '../../account'

const button =
  'mx-auto flex h-10 w-full max-w-[400px] items-center justify-center gap-2.5 rounded-full border border-[#dadce0] bg-white px-3 text-[14px] font-medium text-[#3c4043] hover:bg-[#f8faff] disabled:opacity-60 dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#1e1f20]'

function SpotifyMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#1db954" />
      <path d="M6 9.2c4-1.1 8.3-.8 12 1.2" stroke="#000" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.8 12.6c3.3-.9 6.6-.6 9.6 1" stroke="#000" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7.6 15.7c2.6-.6 5-.4 7.4.8" stroke="#000" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function GoogleMark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-5 items-center justify-center rounded-full border border-line text-[12px] font-bold text-[#4285f4]"
    >
      G
    </span>
  )
}

const providers = [
  { id: 'spotify', label: 'Continue with Spotify', Mark: SpotifyMark },
  { id: 'google', label: 'Continue with Google', Mark: GoogleMark },
]

export default function SocialButtons({ onError }) {
  const { signInWithProvider } = useAccount()
  const [busy, setBusy] = useState(null)

  const start = async (id) => {
    setBusy(id)
    try {
      await signInWithProvider(id)
    } catch (err) {
      onError?.(err.message)
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {providers.map(({ id, label, Mark }) => (
        <button key={id} type="button" disabled={Boolean(busy)} onClick={() => start(id)} className={button}>
          <Mark />
          {busy === id ? 'Opening…' : label}
        </button>
      ))}
      <div className="flex items-center gap-3 text-[13px] text-muted">
        <span className="h-px flex-1 bg-line" />
        or use email
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  )
}
