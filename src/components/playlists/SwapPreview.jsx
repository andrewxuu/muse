import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import AlbumArt from '../songs/AlbumArt'
import SpotifyError from './SpotifyError'
import { matchPercent, swapFit } from '../../lib/playlistMood'
import { Spinner } from '../ui/Skeleton'

function Row({ song, d, tag, icon: Icon, tone }) {
  const fit = matchPercent(d)
  return (
    <div className="flex items-center gap-2.5">
      <AlbumArt song={song} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {song.title}
          {tag && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-normal ${tag === 'new' ? 'bg-teal-soft text-teal' : 'bg-cream text-muted'}`}>{tag}</span>
          )}
        </p>
        <p className="truncate text-[13px] text-muted">{song.artist}</p>
      </div>
      <span className={`flex shrink-0 items-center gap-1 text-[13px] tabular-nums ${tone}`}>
        <Icon size={13} aria-hidden="true" />
        {fit}%
      </span>
    </div>
  )
}

export default function SwapPreview({ plan, moodLabel, onApply, onCancel }) {
  const [chosen, setChosen] = useState(() => new Set(plan.pairs.map((p) => p.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const cancelRef = useRef(null)
  const fit = useMemo(() => swapFit(plan, chosen), [plan, chosen])

  useEffect(() => {
    const opener = document.activeElement
    cancelRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onCancel, busy])

  const toggle = (id) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      await onApply(plan.pairs.filter((p) => chosen.has(p.id)))
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-title"
        className="flex max-h-[92dvh] w-full max-w-[760px] flex-col gap-4 rounded-t-[20px] bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-h-[90dvh] sm:rounded-[20px] sm:p-6"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="swap-title" className="font-serif text-[22px] font-semibold">
            {moodLabel}: swap {chosen.size} of {plan.scored.length} songs
          </h2>
          <p className="text-[15px] text-muted">Uncheck any pair to keep that song. Nothing changes on Spotify until you apply.</p>
        </div>

        <div className="-mb-2 hidden grid-cols-2 gap-4 px-3 text-[13px] text-muted sm:grid">
          <p>Leaving</p>
          <p>Coming in</p>
        </div>

        <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto rounded-[14px] border border-line px-3">
          {plan.pairs.map((p) => {
            const on = chosen.has(p.id)
            return (
              <div key={p.id} className="grid gap-2 py-3 sm:grid-cols-2 sm:gap-4">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`Swap ${p.out.song.title}`}
                    onClick={() => toggle(p.id)}
                    className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${on ? 'border-teal bg-teal text-white' : 'border-line bg-surface'}`}
                  >
                    {on && <Check size={14} aria-hidden="true" />}
                  </button>
                  <div className={`min-w-0 flex-1 ${on ? '' : 'opacity-50'}`}>
                    <Row song={p.out.song} d={p.out.d} icon={Minus} tone="text-danger" />
                  </div>
                </div>
                <div className={`pl-[34px] sm:pl-0 ${on ? '' : 'opacity-50'}`}>
                  <Row song={p.inn.song} d={p.inn.d} tag={p.inn.tag} icon={Plus} tone="text-teal" />
                </div>
              </div>
            )
          })}
        </div>

        <SpotifyError error={error} />

        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <p className="w-full text-[13px] text-muted sm:mr-auto sm:w-auto">
            Playlist fit goes from {fit.before}% to {fit.after}%
          </p>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-11 flex-1 rounded-full border border-line px-4 text-[15px] font-semibold hover:border-teal sm:h-10 sm:flex-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={busy || !chosen.size}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-teal px-4 text-[15px] font-semibold text-white disabled:opacity-60 sm:h-10 sm:flex-none"
          >
            {busy && <Spinner />}
            {busy ? 'Updating…' : 'Apply swap'}
          </button>
        </div>
      </div>
    </div>
  )
}
