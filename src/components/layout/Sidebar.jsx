import { useEffect, useState } from 'react'
import { ChartColumn, House, List, Maximize, MessageCircle, Minimize } from 'lucide-react'
import Logo from '../ui/Logo'
import { useSpotify } from '../../spotify/useSpotify'
import { useAccount } from '../../account'
import { useDevMode } from '../../lib/devMode'

function DevBadge() {
  const { on } = useDevMode()
  if (!on) return null
  return <span className="rounded-full bg-mood-okay px-2.5 py-0.5 text-xs font-semibold text-white">Dev mode</span>
}

const links = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'mood', label: 'Stats', icon: ChartColumn },
  { id: 'playlists', label: 'Playlists', icon: List },
]

function useProfileInfo() {
  const { profile } = useSpotify()
  const { name: accountName } = useAccount()
  return { image: profile?.image, name: profile?.name ?? accountName ?? 'Guest' }
}

function Avatar({ image, name, size }) {
  return image ? (
    <img src={image} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-teal-soft text-sm font-semibold text-teal`}>
      {name[0].toUpperCase()}
    </div>
  )
}

function FullscreenButton() {
  const [full, setFull] = useState(() => Boolean(document.fullscreenElement))

  useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const installed = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches
  if (!document.fullscreenEnabled || installed) return null

  const toggle = () => {
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    request.catch(() => {})
  }
  const Icon = full ? Minimize : Maximize

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={full}
      aria-label={full ? 'Exit full screen' : 'Enter full screen'}
      className="relative -mr-1 ml-auto flex size-12 items-center justify-center rounded-full text-muted active:bg-track"
    >
      <Icon size={22} aria-hidden="true" />
    </button>
  )
}

export function MobileHeader({ onOpenSettings }) {
  const { image, name } = useProfileInfo()

  return (
    <header className="absolute inset-x-0 top-0 z-10 flex h-16 items-center px-4 pt-[env(safe-area-inset-top)] md:hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-5 top-0 bg-cream/80 backdrop-blur-md [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
      />
      <button
        type="button"
        onClick={onOpenSettings}
        aria-haspopup="dialog"
        aria-label="Settings"
        className="relative -ml-1 flex size-12 items-center justify-center rounded-full active:bg-track"
      >
        <span className="rounded-full p-0.5 ring-1 ring-line">
          <Avatar image={image} name={name} size="size-10" />
        </span>
      </button>
      <div className="relative ml-2">
        <DevBadge />
      </div>
      <FullscreenButton />
    </header>
  )
}

export default function Sidebar({ page, onNavigate, onOpenSettings }) {
  const { image, name } = useProfileInfo()

  return (
    <>
      <aside className="hidden h-full w-[72px] shrink-0 flex-col gap-7 overflow-y-auto border-r border-line bg-surface px-3 py-7 md:flex lg:w-[248px] lg:px-[18px]">
        <div className="flex items-center justify-center gap-2.5 lg:justify-start">
          <Logo size={36} className="shrink-0" />
          <p className="hidden font-serif text-[22px] font-semibold lg:block">Muse</p>
        </div>
        <div className="-mt-4 flex justify-center lg:justify-start">
          <DevBadge />
        </div>

        <nav className="flex flex-col gap-1.5">
          {links.map(({ id, label, icon: Icon }) => {
            const on = page === id
            return (
              <button
                key={id}
                type="button"
                title={label}
                aria-label={label}
                aria-current={on ? 'page' : undefined}
                onClick={() => onNavigate(id)}
                className={`flex h-11 items-center justify-center gap-3 rounded-[14px] text-left text-[15px] lg:justify-start lg:px-3.5 ${
                  on ? 'bg-teal-soft font-semibold text-teal' : 'text-muted hover:bg-cream'
                }`}
              >
                <Icon size={20} className="shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </button>
            )
          })}
        </nav>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onOpenSettings}
          aria-haspopup="dialog"
          aria-label="Settings"
          title="Settings"
          className="flex items-center justify-center gap-2.5 rounded-[14px] py-1.5 text-left hover:bg-cream lg:-mx-2 lg:justify-start lg:px-2"
        >
          <Avatar image={image} name={name} size="size-9" />
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="mt-1 text-[13px] text-muted">Settings</p>
          </div>
        </button>
      </aside>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {links.map(({ id, label, icon: Icon }) => {
          const on = page === id
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-current={on ? 'page' : undefined}
              onClick={() => onNavigate(id)}
              className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
                on ? 'font-semibold text-teal' : 'text-muted'
              }`}
            >
              <Icon size={20} />
              {label}
            </button>
          )
        })}
      </nav>
    </>
  )
}
