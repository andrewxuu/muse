import { useEffect, useState } from 'react'
import { callStats, onCalls, printCalls, resetCalls } from '../../lib/callLog'

const minutes = (ms) => `${Math.max(1, Math.ceil(ms / 60000))} min`
const clock = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const tone = {
  ok: 'border-line bg-surface text-ink',
  warn: 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  blocked: 'border-danger bg-surface text-danger',
}

export default function CallBadge() {
  const [stats, setStats] = useState(callStats)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const stop = onCalls(setStats)
    const timer = setInterval(() => setStats(callStats()), 5000)
    return () => {
      stop()
      clearInterval(timer)
    }
  }, [])

  const state = stats.blockedFor > 0 ? 'blocked' : stats.last30s >= stats.windowLimit * 0.8 ? 'warn' : 'ok'
  const label =
    state === 'blocked'
      ? `Blocked · retry in ${minutes(stats.blockedFor)}`
      : `${stats.last30s}/${stats.windowLimit} in 30s · ${stats.today} today`
  const guess = stats.windowLearned ? '' : '~'

  return (
    <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-50 flex flex-col items-start gap-2 font-mono text-[12px]">
      {open && (
        <div className="w-[min(18rem,calc(100vw-1.5rem))] rounded-[12px] border border-line bg-surface p-3 text-ink shadow-lg">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            <dt className="text-muted">Last 30s</dt>
            <dd>
              {stats.last30s} of {guess}
              {stats.windowLimit}
            </dd>
            <dt className="text-muted">Last hour</dt>
            <dd>{stats.lastHour}</dd>
            <dt className="text-muted">Last 24h</dt>
            <dd>
              {stats.today}
              {stats.dayLimit != null && ` of ${stats.dayLimit}`}
            </dd>
            <dt className="text-muted">Left today</dt>
            <dd>{stats.leftDay ?? 'unknown'}</dd>
            <dt className="text-muted">Last block</dt>
            <dd>{stats.lastBlock ? `${stats.lastBlock.inWindow} in 30s, ${clock(stats.lastBlock.at)}` : 'none yet'}</dd>
          </dl>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={printCalls} className="h-8 rounded-full border border-line px-3 hover:border-teal">
              Log details
            </button>
            <button type="button" onClick={() => resetCalls()} className="h-8 rounded-full border border-line px-3 hover:border-teal">
              Reset count
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Spotify calls: ${label}`}
        className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 ${tone[state]}`}
      >
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${state === 'blocked' ? 'bg-danger' : state === 'warn' ? 'bg-amber-500' : 'bg-teal'}`}
        />
        {label}
      </button>
    </div>
  )
}
