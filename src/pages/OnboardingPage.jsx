import { useState } from 'react'
import { Check, MessageCircle, Music, Settings, Smile } from 'lucide-react'
import CardFrame from '../components/layout/CardFrame'
import Logo from '../components/ui/Logo'
import AuthForm from '../components/auth/AuthForm'
import AppearancePicker from '../components/settings/AppearancePicker'
import StressFace from '../components/ui/StressFace'
import { ratingMood, stressLabel, useRatings } from '../ratings'
import { useAccount } from '../account'
import { useSpotify } from '../spotify/useSpotify'
import { genres, useGenrePrefs } from '../lib/genrePrefs'
import { STEP_KEY, readKey, writeKey } from '../lib/storageKeys'

const primary = 'h-11 rounded-[14px] bg-teal px-5 text-[15px] font-semibold text-white'
const secondary = 'h-11 rounded-[14px] border border-line px-5 text-[15px] font-semibold hover:border-teal'

const features = [
  { icon: MessageCircle, title: 'Chat', text: 'Describe your day' },
  { icon: Music, title: 'Songs', text: 'Get matched tracks' },
  { icon: Smile, title: 'Mood', text: 'Track how you feel' },
]

function Features() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {features.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex flex-col gap-1.5 rounded-[14px] bg-cream p-4">
          <Icon size={20} className="text-teal" aria-hidden="true" />
          <p className="text-[15px] font-semibold">{title}</p>
          <p className="text-[13px] text-muted">{text}</p>
        </div>
      ))}
    </div>
  )
}

function FirstCheckIn() {
  const { ratings, addRating, updateRating } = useRatings()
  const [id, setId] = useState(null)
  const current = ratings.find((r) => r.id === id)

  const pick = (value) => {
    if (current) updateRating(current.id, { rating: value })
    else setId(addRating(value))
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Stress from 1, calm, to 5, very stressed" className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }, (_, i) => {
          const value = i + 1
          const on = current?.rating === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${value} out of 5, ${stressLabel(value)}`}
              onClick={() => pick(value)}
              className="flex flex-col items-center gap-1.5 rounded-[10px] py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            >
              <StressFace mood={ratingMood(value)} size={48} ring={on} dim={!on && !!current} />
              <span className={`text-center text-[11px] leading-tight ${on ? 'font-semibold' : 'text-muted'}`}>{stressLabel(value)}</span>
            </button>
          )
        })}
      </div>
      {current ? (
        <p role="status" className="flex items-center gap-1.5 text-[14px] text-teal">
          <Check size={14} aria-hidden="true" />
          Logged {current.rating}/5 ({stressLabel(current.rating)})
        </p>
      ) : (
        <SettingsNote>You can skip this and check in later.</SettingsNote>
      )}
    </div>
  )
}

function SettingsNote({ children }) {
  return (
    <p className="flex items-center gap-1.5 text-[12px] text-muted">
      <Settings size={13} className="shrink-0" aria-hidden="true" />
      {children}
    </p>
  )
}

function Genres() {
  const { liked, toggle } = useGenrePrefs()
  return (
    <div role="group" aria-label="Genres you like" className="flex flex-wrap gap-2">
      {genres.map((g) => {
        const on = liked.includes(g)
        return (
          <button
            key={g}
            type="button"
            aria-pressed={on}
            onClick={() => toggle('liked', g)}
            className={`flex h-9 items-center gap-1 rounded-full border px-3.5 text-[14px] ${
              on ? 'border-teal bg-teal-soft font-semibold text-teal' : 'border-line bg-surface hover:border-teal'
            }`}
          >
            {on && <Check size={14} aria-hidden="true" />}
            {g}
          </button>
        )
      })}
    </div>
  )
}

function SpotifyStep({ connected, expired, profile, error }) {
  if (connected && profile) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[14px] bg-teal-soft p-5 text-center">
        {profile.image ? (
          <img src={profile.image} alt="" className="size-20 rounded-full object-cover" />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-full bg-teal text-3xl font-semibold text-white">
            {profile.name[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[18px] font-semibold">{profile.name}</p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-[13px] text-teal">
            <Check size={14} aria-hidden="true" />
            Connected to Spotify
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] bg-teal-soft p-5 text-center">
      <p className="text-[18px] font-semibold text-teal">Spotify</p>
      <p className="text-[13px] text-muted">
        {connected ? 'Connected' : expired ? 'Your login expired. Connect again.' : 'You can skip this and connect later in settings.'}
      </p>
      {error && !connected && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export default function OnboardingPage() {
  const { user, guest, finishOnboarding } = useAccount()
  const { status, connect, profile, error } = useSpotify()
  const [withAccount] = useState(() => !(user || guest))
  const ids = withAccount ? ['welcome', 'account', 'spotify', 'genres', 'look', 'checkin'] : ['welcome', 'spotify', 'genres', 'look', 'checkin']
  const [id, setId] = useState(() => {
    const saved = readKey(STEP_KEY)
    if (ids.includes(saved)) return saved
    return saved === 'account' ? 'spotify' : ids[0]
  })

  const index = ids.indexOf(id)
  const last = index === ids.length - 1
  const connected = status === 'connected' || status === 'syncing'

  const go = (next) => {
    setId(next)
    writeKey(STEP_KEY, next)
  }
  const next = () => go(ids[index + 1])
  const back = () => go(ids[index - 1])

  const connectSpotify = () => {
    writeKey(STEP_KEY, 'spotify')
    connect()
  }

  const copy = {
    welcome: ['Welcome to Muse', 'Tell it how you feel. It finds songs that fit your mood.'],
    spotify: ['Connect Spotify', 'Muse uses Spotify to play songs and save playlists.'],
    genres: ['Pick your genres', 'Choose what you like. Muse uses it when picking songs.'],
    look: ['Make it yours', 'Pick a site palette and a stress palette.'],
    checkin: ['How stressed are you?', 'Your first check-in starts your mood calendar.'],
  }

  return (
    <CardFrame>
      <div className="flex flex-col gap-2">
        <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={ids.length} aria-valuenow={index + 1}>
          {ids.map((step, i) => (
            <div key={step} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-teal' : 'bg-track'}`} />
          ))}
        </div>
        <p className="text-[13px] text-muted">
          Step {index + 1} of {ids.length}
        </p>
      </div>

      {id === 'account' ? (
        <AuthForm onDone={next} />
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {id === 'welcome' && <Logo size={64} className="mb-2" />}
            <h1 className="font-serif text-[28px] font-semibold sm:text-[32px]">{copy[id][0]}</h1>
            <p className="text-[15px] text-muted">{copy[id][1]}</p>
          </div>
          {id === 'welcome' && <Features />}
          {id === 'spotify' && <SpotifyStep connected={connected} expired={status === 'expired'} profile={profile} error={error} />}
          {id === 'genres' && (
            <>
              <Genres />
              <SettingsNote>You can change your genres anytime in Settings.</SettingsNote>
            </>
          )}
          {id === 'look' && (
            <>
              <AppearancePicker />
              <SettingsNote>You can change your palettes anytime in Settings.</SettingsNote>
            </>
          )}
          {id === 'checkin' && <FirstCheckIn />}
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        {index > 0 && id !== 'spotify' ? (
          <button type="button" onClick={back} className={secondary}>
            Back
          </button>
        ) : id === 'spotify' && !connected ? (
          <button type="button" onClick={next} className={secondary}>
            Skip for now
          </button>
        ) : (
          <span />
        )}

        {id === 'welcome' && (
          <button type="button" onClick={next} className={primary}>
            Get started
          </button>
        )}
        {id === 'spotify' &&
          (connected ? (
            <button type="button" onClick={next} className={primary}>
              Continue
            </button>
          ) : (
            <button type="button" onClick={connectSpotify} className={primary}>
              Connect Spotify
            </button>
          ))}
        {(id === 'genres' || id === 'look') && (
          <button type="button" onClick={next} className={primary}>
            Continue
          </button>
        )}
        {last && (
          <button type="button" onClick={finishOnboarding} className={primary}>
            Open Muse
          </button>
        )}
      </div>
    </CardFrame>
  )
}
