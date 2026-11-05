import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Monitor, Moon, Music, Sun, X } from 'lucide-react'
import GenrePrefs from './GenrePrefs'
import { PaletteDropdown } from './AppearancePicker'
import Toggle from '../ui/Toggle'
import { useSpotify } from '../../spotify/useSpotify'
import { useTheme } from '../../theme'
import { useAccount } from '../../account'
import { useSettings } from '../../lib/settingsPrefs'
import { setDevMode, setSampleData, useDevMode } from '../../lib/devMode'

const themes = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
]

function Group({ title, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] text-muted">{title}</h3>
      {children}
    </section>
  )
}

const Card = ({ children }) => <div className="divide-y divide-line overflow-hidden rounded-[14px] border border-line">{children}</div>

function ToggleRow({ title, detail, checked, onChange }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        {detail && <p className="mt-0.5 text-[13px] text-muted">{detail}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

function SignInMethods() {
  const { providers, linkProvider } = useAccount()
  const [error, setError] = useState('')

  const link = async (id) => {
    setError('')
    try {
      await linkProvider(id)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Group title="Sign in methods">
      <Card>
        {[
          ['google', 'Google'],
          ['spotify', 'Spotify'],
        ].map(([id, label]) => {
          const linked = providers.includes(id)
          return (
            <div key={id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{label}</p>
                <p className="mt-0.5 text-[13px] text-muted">{linked ? 'Linked' : 'Not linked'}</p>
              </div>
              {!linked && (
                <button type="button" onClick={() => link(id)} className="h-9 rounded-full border border-line px-4 text-sm hover:border-teal">
                  Link
                </button>
              )}
            </div>
          )
        })}
      </Card>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </Group>
  )
}

export default function SettingsModal({ onClose, onLogOut }) {
  const { status, profile, connect, disconnect } = useSpotify()
  const { user, guest, name: accountName, startReplay } = useAccount()
  const connected = status === 'connected' || status === 'syncing'
  const closeRef = useRef(null)
  const dev = useDevMode()
  const taps = useRef({ count: 0, timer: null })
  const [devNote, setDevNote] = useState('')

  const { theme, setTheme } = useTheme()
  const { prefs, setPref } = useSettings()

  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onClose])

  const name = profile?.name ?? accountName ?? 'Guest'

  const tapTitle = () => {
    const t = taps.current
    t.count += 1
    clearTimeout(t.timer)
    t.timer = setTimeout(() => (t.count = 0), 2000)
    if (t.count < 7) return
    t.count = 0
    setDevMode(!dev.on)
    setDevNote(dev.on ? 'Dev mode off' : 'Dev mode on')
    setTimeout(() => setDevNote(''), 2500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="flex max-h-[calc(100vh-32px)] w-full max-w-[560px] flex-col gap-5 overflow-y-auto rounded-[20px] bg-surface p-7"
      >
        <div className="flex items-center justify-between">
          <h2 id="settings-title" onClick={tapTitle} className="select-none font-serif text-[28px] font-semibold">
            Settings
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full border border-line text-teal hover:bg-teal-soft"
          >
            <X size={18} />
          </button>
        </div>

        <Group title="Account">
          <Card>
            <div className="flex items-center gap-3 px-4 py-3">
              {profile?.image ? (
                <img src={profile.image} alt="" className="size-10 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-soft font-semibold text-teal">
                  {name[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{name}</p>
                <p className="mt-0.5 truncate text-[13px] text-muted">
                  {user?.email ?? (profile?.id ? `Spotify username: ${profile.id}` : 'Connect Spotify to use your name and photo')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal">
                <Music size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Spotify</p>
                <p className="mt-0.5 text-[13px] text-muted">{connected ? 'Connected' : status === 'expired' ? 'Login expired' : 'Not connected'}</p>
              </div>
              {connected ? (
                <button type="button" onClick={disconnect} className="h-9 rounded-full border border-line px-4 text-sm hover:border-teal">
                  Disconnect
                </button>
              ) : (
                <button type="button" onClick={connect} className="h-9 rounded-full bg-teal px-4 text-sm text-white">
                  {status === 'expired' ? 'Reconnect' : 'Connect'}
                </button>
              )}
            </div>

            {(connected || user || guest) && (
              <button
                type="button"
                onClick={onLogOut}
                className="w-full px-4 py-3.5 text-left text-[15px] font-semibold text-danger hover:bg-cream"
              >
                {guest && !user ? 'Create account or log in' : 'Log out'}
              </button>
            )}
          </Card>
        </Group>

        {user && <SignInMethods />}

        <Group title="Appearance">
          <div role="radiogroup" aria-label="Theme" className="flex gap-1 rounded-[14px] bg-track p-1">
            {themes.map(({ id, label, icon: Icon }) => {
              const on = theme === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setTheme(id)}
                  className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[11px] text-sm ${
                    on ? 'border border-line bg-surface font-semibold text-ink' : 'text-muted'
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              )
            })}
          </div>
          <div className="mt-3">
            <PaletteDropdown />
          </div>
        </Group>

        <Group title="Music preferences">
          <GenrePrefs />
        </Group>

        <Group title="Notifications">
          <Card>
            <ToggleRow title="Daily check-in reminder" detail="A nudge to log how you feel" checked={prefs.reminder} onChange={setPref('reminder')} />
            <ToggleRow title="New music suggestions" checked={prefs.suggestions} onChange={setPref('suggestions')} />
          </Card>
        </Group>

        <Group title="Privacy">
          <Card>
            <ToggleRow
              title="Use Spotify listening history"
              detail="Helps Muse pick better songs"
              checked={prefs.listening}
              onChange={setPref('listening')}
            />
            <ToggleRow title="Save chat history" checked={prefs.chatHistory} onChange={setPref('chatHistory')} />
            <button type="button" className="flex w-full items-center px-4 py-3.5 text-left hover:bg-cream">
              <span className="flex-1 text-[15px] font-semibold">Delete my data</span>
              <ChevronRight size={18} className="text-muted" />
            </button>
          </Card>
        </Group>

        {devNote && (
          <p role="status" className="text-center text-[13px] text-muted">
            {devNote}
          </p>
        )}

        {dev.on && (
          <Group title="Developer">
            <Card>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  startReplay()
                }}
                className="w-full px-4 py-3.5 text-left text-[15px] font-semibold hover:bg-cream"
              >
                Replay onboarding
              </button>
              <ToggleRow
                title="Sample data"
                detail="Fake check-ins, chats and songs"
                checked={dev.sample}
                onChange={setSampleData}
              />
              <button
                type="button"
                onClick={() => setDevMode(false)}
                className="w-full px-4 py-3.5 text-left text-[15px] font-semibold text-danger hover:bg-cream"
              >
                Turn off dev mode
              </button>
            </Card>
          </Group>
        )}
      </div>
    </div>
  )
}
