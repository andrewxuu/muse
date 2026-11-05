import { useState } from 'react'
import { ArrowRight, Check, Play } from 'lucide-react'
import { usePlayer } from '../../spotify/usePlayer'
import { getPlaylistSongs } from '../../spotify/api'
import { playlistCache } from '../../lib/playlistCache'
import { NEW_MAX } from '../../lib/playlistMood'
import Collapse from '../ui/Collapse'

const STEPS = [
  { id: 'mood', label: 'Reading your mood' },
  { id: 'find', label: 'Finding songs that fit' },
  { id: 'order', label: 'Putting them in order' },
  { id: 'save', label: 'Saving to Spotify' },
]

const lengthOf = (minutes) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`)

function Tiles({ art, shown = art.length, ripple }) {
  const motion = ripple ? 'tile-ripple' : 'motion-safe:animate-tile-in'
  const delay = (i) => (ripple ? { animationDelay: `${300 + i * 35}ms` } : undefined)
  return (
    <div className="flex flex-wrap gap-1.5" aria-hidden="true">
      {art.map((image, i) =>
        i < shown ? (
          image ? (
            <img key={i} src={image} alt="" style={delay(i)} className={`size-9 rounded-md object-cover sm:size-10 ${motion}`} />
          ) : (
            <div key={i} style={delay(i)} className={`size-9 rounded-md bg-art sm:size-10 ${motion}`} />
          )
        ) : (
          <div key={i} className="size-9 rounded-md border border-dashed border-line sm:size-10" />
        )
      )}
    </div>
  )
}

function Shell({ bare, children }) {
  return bare ? (
    <div className="flex w-full flex-col gap-3">{children}</div>
  ) : (
    <div className="flex w-full max-w-[440px] flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">{children}</div>
  )
}

function MixActions({ mix, onOpen }) {
  const { play, notify, canPlay } = usePlayer()
  const [loading, setLoading] = useState(false)

  const start = async () => {
    setLoading(true)
    try {
      let songs = playlistCache.get(mix.id)
      if (!songs) {
        songs = await getPlaylistSongs(mix.id)
        playlistCache.set(mix.id, songs)
      }
      await play(songs)
    } catch {
      notify('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canPlay && (
        <button
          type="button"
          onClick={loading ? undefined : start}
          className="flex h-10 items-center gap-1.5 rounded-full bg-teal px-4 text-sm font-semibold text-white"
        >
          <Play size={16} fill="currentColor" aria-hidden="true" />
          {loading ? 'Loading…' : 'Play'}
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpen(mix.id)}
        className="flex h-10 items-center gap-1.5 rounded-full border border-teal bg-surface px-4 text-sm font-semibold text-teal hover:bg-teal-soft"
      >
        Open playlist
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

const readyLine = (mix) => `Ready · ${mix.count} songs${mix.minutes ? ` · ${lengthOf(mix.minutes)}` : ''}`

export function MixReady({ mix, onOpen, bare }) {
  return (
    <Shell bare={bare}>
      <div className="min-w-0">
        <p className="truncate font-serif text-[20px] font-semibold">{mix.name}</p>
        <p className="text-[13px] text-muted">{readyLine(mix)}</p>
      </div>
      {mix.art?.length > 0 && <Tiles art={mix.art} />}
      <MixActions mix={mix} onOpen={onOpen} />
    </Shell>
  )
}

function StepList({ index }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {STEPS.map((s, i) => {
        const done = i < index
        const active = i === index
        return (
          <li key={s.id} className={`flex items-center gap-2.5 text-sm ${active ? 'text-ink' : done ? 'text-muted' : 'text-hint'}`}>
            <span
              className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border ${
                done ? 'border-teal bg-teal text-white' : active ? 'border-teal motion-safe:animate-step-pulse' : 'border-line'
              }`}
            >
              {done && <Check size={12} strokeWidth={3} />}
            </span>
            {s.label}
            {done && <span className="sr-only">, done</span>}
          </li>
        )
      })}
    </ol>
  )
}

function describe(progress) {
  const done = Boolean(progress.mix)
  const index = done ? STEPS.length : STEPS.findIndex((s) => s.id === progress.step)
  const total = progress.songs.length
  const saving = done || progress.step === 'save'
  const shown = done ? total : progress.shown
  const within = saving && total ? shown / total : 0.5
  const percent = Math.round(((index + within) / STEPS.length) * 100)
  const last = saving && shown ? progress.songs[shown - 1] : null
  const detail = saving ? (last ? `Added ${last.title}` : 'Creating your playlist') : progress.detail
  const found = progress.found ?? []
  const useSongs = saving && total
  return {
    done,
    index,
    percent,
    detail: detail ?? STEPS[index]?.label,
    tileArt: useSongs ? progress.songs.map((s) => s.image ?? null) : Array.from({ length: NEW_MAX }, (_, i) => found[i]?.image ?? null),
    tileShown: useSongs ? shown : found.length,
    tileLabel: useSongs
      ? `${shown} of ${total} songs`
      : found.length
        ? `Found ${found.length} ${found.length === 1 ? 'song' : 'songs'} so far`
        : 'Looking for songs…',
  }
}

function WideBuild({ progress, onOpen }) {
  const { done, index, percent, detail, tileArt, tileShown, tileLabel } = describe(progress)
  const mix = progress.mix

  return (
    <div className="flex w-full flex-col">
      <Collapse open={!done}>
        <div className="flex flex-col gap-2 pb-3">
          <div role="status" aria-live="polite" className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="font-serif text-[17px] font-semibold">Building your mix…</p>
            <p className="min-h-5 truncate text-[13px] text-muted">{detail}</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-track">
            <div className="h-full rounded-full bg-teal transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </Collapse>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid">
          <div
            inert={done}
            className={`[grid-area:1/1] transition duration-300 motion-reduce:transition-none ${done ? '-translate-y-1.5 opacity-0' : ''}`}
          >
            <StepList index={index} />
          </div>
          <div
            inert={!done}
            className={`[grid-area:1/1] min-w-0 transition delay-[120ms] duration-[350ms] motion-reduce:transition-none ${
              done ? '' : 'translate-y-2 opacity-0'
            }`}
          >
            {mix && (
              <>
                <p role="status" className="truncate font-serif text-[20px] font-semibold">
                  {mix.name}
                </p>
                <p className="mb-3 mt-0.5 text-[13px] text-muted">{readyLine(mix)}</p>
                <MixActions mix={mix} onOpen={onOpen} />
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Tiles art={tileArt} shown={tileShown} ripple={done} />
          <p className={`text-[13px] font-semibold text-teal transition-opacity duration-300 ${done ? 'opacity-0' : ''}`}>{tileLabel}</p>
        </div>
      </div>
    </div>
  )
}

export default function MixBuild({ progress, onOpen, bare, wide }) {
  if (!progress) return null
  if (wide) return <WideBuild progress={progress} onOpen={onOpen} />
  if (progress.mix) return <MixReady mix={progress.mix} onOpen={onOpen} bare={bare} />

  const { index, percent, detail, tileArt, tileShown, tileLabel } = describe(progress)

  return (
    <Shell bare={bare}>
      <div role="status" aria-live="polite">
        <p className="font-serif text-[20px] font-semibold">Building your mix…</p>
        <p className="min-h-5 truncate text-[13px] text-muted">{detail}</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-track">
        <div className="h-full rounded-full bg-teal transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
      </div>
      <StepList index={index} />
      {index >= 1 && (
        <div className="flex flex-col gap-1.5">
          <Tiles art={tileArt} shown={tileShown} />
          <p className="text-[13px] font-semibold text-teal">{tileLabel}</p>
        </div>
      )}
    </Shell>
  )
}
