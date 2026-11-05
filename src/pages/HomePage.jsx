import { useSpotify } from '../spotify/useSpotify'
import { useState } from 'react'
import { CircleCheck, Plus } from 'lucide-react'
import StressFace from '../components/ui/StressFace'
import { ratingMood, stressLabel, stressValue, useRatings } from '../ratings'
import SongRow from '../components/songs/SongRow'
import PlaylistDetail from './PlaylistDetail'
import PlaylistPick from '../components/playlists/PlaylistPick'
import { stateFor } from '../lib/moodTags'
import { SkeletonSongRow, SkeletonTile } from '../components/ui/Skeleton'

function greetingFor(hour) {
  if (hour < 5) return 'Up late'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function Section({ title, aside, children, className = '' }) {
  return (
    <section className={`flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside && <div className="text-[13px] text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString()

const MOOD_BG = {
  great: 'bg-mood-great',
  good: 'bg-mood-good',
  okay: 'bg-mood-okay',
  low: 'bg-mood-low',
  awful: 'bg-mood-awful',
}

function MoodRating({ onNavigate }) {
  const { ratings, addRating, updateRating } = useRatings()
  const [currentId, setCurrentId] = useState(null)
  const [draft, setDraft] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)

  const current = ratings.find((r) => r.id === currentId)
  const todayAll = ratings.filter((r) => isToday(r.at)).reverse()
  const first = todayAll[0]
  const last = todayAll.at(-1)
  const trend = !last
    ? ''
    : todayAll.length === 1
      ? `${stressLabel(last.rating)} at ${timeOf(last.at)}`
      : stressLabel(first.rating) === stressLabel(last.rating)
        ? `Steady at ${stressLabel(last.rating)}`
        : `Started ${stressLabel(first.rating)}, now ${stressLabel(last.rating)}`

  const pick = (rating) => {
    if (current) {
      updateRating(current.id, { rating })
    } else {
      setCurrentId(addRating(rating))
      setDraft('')
      setNoteSaved(false)
    }
  }

  const saveNote = () => {
    updateRating(current.id, { note: draft.trim() })
    setNoteSaved(true)
  }

  const logAnother = () => {
    setCurrentId(null)
    setDraft('')
    setNoteSaved(false)
  }

  return (
    <Section title="Rate your stress">
      <div role="radiogroup" aria-label="Stress from 1, calm, to 5, very stressed" className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }, (_, i) => {
          const value = i + 1
          const mood = ratingMood(value)
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
              <StressFace mood={mood} size={56} ring={on} dim={!on && !!current} />
              <span className={`text-center text-[12px] leading-tight ${on ? 'font-semibold' : 'text-muted'}`}>{stressLabel(value)}</span>
            </button>
          )
        })}
      </div>

      {current && (
        <div className="flex flex-col gap-2.5 border-t border-line pt-3">
          <p role="status" className="flex flex-wrap items-center gap-x-1.5 text-sm">
            <CircleCheck size={16} className="text-teal" aria-hidden="true" />
            <span className="font-semibold">
              Logged {current.rating}/5 ({stressLabel(current.rating)})
            </span>
            at {timeOf(current.at)}
            <span className="text-muted">· Tap another level to change it</span>
          </p>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setNoteSaved(false)
            }}
            rows={2}
            placeholder="Anything on your mind? (optional)"
            aria-label="Note for this check-in"
            className="w-full resize-none rounded-[10px] border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-hint focus:border-teal"
          />
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={logAnother}
              className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-teal-soft px-3.5 text-sm font-semibold text-teal hover:brightness-95"
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              Log another check-in
            </button>
            {noteSaved ? (
              <span className="text-sm text-muted">Note saved</span>
            ) : (
              <button
                type="button"
                onClick={saveNote}
                disabled={!draft.trim()}
                className="h-9 rounded-full bg-teal px-4 text-sm text-white disabled:opacity-40"
              >
                Save note
              </button>
            )}
          </div>
        </div>
      )}

      {todayAll.length > (current ? 1 : 0) && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">
              {todayAll.length} check-in{todayAll.length === 1 ? '' : 's'} today
            </h3>
            <button type="button" onClick={() => onNavigate('mood')} className="text-[13px] font-semibold text-teal hover:underline">
              See all in Stats
            </button>
          </div>
          <div role="img" aria-label={todayAll.map((r) => `${stressLabel(r.rating)} at ${timeOf(r.at)}`).join(', ')} className="flex gap-1">
            {todayAll.map((r) => (
              <span key={r.id} title={`${stressLabel(r.rating)} at ${timeOf(r.at)}`} className={`h-2 flex-1 rounded-full ${MOOD_BG[ratingMood(r.rating)]}`} />
            ))}
          </div>
          <p className="text-[13px] text-muted">{trend}</p>
        </div>
      )}
    </Section>
  )
}

function SeeAll({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-[13px] font-semibold text-teal hover:underline">
      See all
    </button>
  )
}

function RecentlySaved({ savedSongs, isSaved, onSave, onOpenLiked }) {
  const { status } = useSpotify()
  const songs = savedSongs.slice(0, 4)

  return (
    <Section title="Recently saved" aside={songs.length > 0 && <SeeAll onClick={onOpenLiked} />}>
      {songs.length ? (
        <div className="flex flex-col gap-3">
          {songs.map((song) => (
            <SongRow key={`${song.source}-${song.id}`} song={song} saved={isSaved(song.id)} onSave={onSave} />
          ))}
        </div>
      ) : status === 'syncing' ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="sr-only">
            Loading your saved songs
          </p>
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonSongRow key={i} index={i} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Save songs in chat or connect Spotify to fill this list.</p>
      )}
    </Section>
  )
}

function YourPlaylists({ onNavigate, onOpenPlaylist }) {
  const { status, playlists } = useSpotify()
  const lists = playlists.slice(0, 4)
  const needsSpotify = status === 'disconnected' || status === 'expired'

  const empty = needsSpotify ? 'Connect Spotify to see your playlists here.' : 'Your Spotify account doesn’t have any playlists yet.'

  return (
    <Section title="Your playlists" aside={lists.length > 0 && <SeeAll onClick={() => onNavigate('playlists')} />}>
      {lists.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {lists.map((p) => (
            <button key={p.id} type="button" onClick={() => onOpenPlaylist(p.id)} className="block min-w-0 text-left">
              {p.image ? (
                <img src={p.image} alt="" className="aspect-square w-full rounded-[12px] object-cover" />
              ) : (
                <div className="aspect-square rounded-[12px] bg-art" />
              )}
              <p className="mt-2 truncate text-sm font-semibold">{p.name}</p>
              {p.count !== null && <p className="mt-0.5 text-xs text-muted">{p.count} songs</p>}
            </button>
          ))}
        </div>
      ) : status === 'syncing' ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <p role="status" className="sr-only">
            Loading your playlists
          </p>
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonTile key={i} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </Section>
  )
}

export default function HomePage({ savedSongs, isSaved, onSave, onNavigate, onOpenLiked }) {
  const { profile, playlists } = useSpotify()
  const { ratings } = useRatings()
  const [openPlaylistId, setOpenPlaylistId] = useState(null)
  const openPlaylist = playlists.find((p) => p.id === openPlaylistId)
  const firstName = profile?.name?.split(' ')[0]
  const greeting = greetingFor(new Date().getHours())
  const todays = ratings.find((r) => isToday(r.at))
  const recent = ratings.filter((r) => isToday(r.at)).map((r) => stressValue(r.rating)).reverse()
  const state = todays ? stateFor({ stress: stressValue(todays.rating), recent }) : null

  if (openPlaylist) {
    return <PlaylistDetail playlist={openPlaylist} onBack={() => setOpenPlaylistId(null)} isSaved={isSaved} onSave={onSave} />
  }

  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 py-5 md:px-8 md:py-10">
      <div>
        <h1 className="font-serif text-[30px] font-semibold">{firstName ? `${greeting}, ${firstName}` : greeting}</h1>
        <p className="mt-1 text-[15px] text-muted">How are you feeling right now?</p>
      </div>

      <MoodRating onNavigate={onNavigate} />

      <Section title="Playlist for your mood" aside={state?.label}>
        <PlaylistPick state={state} savedSongs={savedSongs} onOpen={setOpenPlaylistId} />
      </Section>

      <RecentlySaved savedSongs={savedSongs} isSaved={isSaved} onSave={onSave} onOpenLiked={onOpenLiked} />

      <YourPlaylists onNavigate={onNavigate} onOpenPlaylist={setOpenPlaylistId} />
    </section>
  )
}
