import { titleCase } from '../../lib/musicStats'

function Tile({ value, label }) {
  return (
    <div className="min-w-0 flex-1 rounded-[12px] bg-cream px-3.5 py-3">
      <p className="truncate text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

function Bars({ title, rows, empty }) {
  const max = Math.max(1, ...rows.map(([, n]) => n))
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted">{title}</p>
      {rows.length === 0 && <p className="text-[13px] text-muted">{empty}</p>}
      {rows.map(([name, n]) => (
        <div key={name} className="flex items-center gap-2.5 text-[13px]">
          <span title={titleCase(name)} className="w-24 shrink-0 truncate sm:w-28">{titleCase(name)}</span>
          <span className="h-2 flex-1 rounded-full bg-track">
            <span className="block h-2 rounded-full bg-teal" style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="w-5 text-right tabular-nums text-muted">{n}</span>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, aside, children }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="text-xs text-muted">{aside}</p>
      </div>
      {children}
    </section>
  )
}

export default function MusicChatStats({ chats, checkIns, songs, periodLabel }) {
  const topGenre = songs.genres[0]?.[0]
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Panel title="Chats" aside={periodLabel}>
        <div className="flex gap-3">
          <Tile value={chats.chats} label={chats.chats === 1 ? 'chat' : 'chats'} />
          <Tile value={checkIns} label={checkIns === 1 ? 'check-in' : 'check-ins'} />
        </div>
        <Bars title="Moods you asked for" rows={chats.moods} empty="No chats in this period." />
      </Panel>

      <Panel title="Songs" aside="All time">
        <div className="flex gap-3">
          <Tile value={songs.total} label="saved songs" />
          <Tile value={topGenre ? titleCase(topGenre) : '–'} label="top genre" />
        </div>
        <Bars
          title="Top genres in your saved songs"
          rows={songs.genres}
          empty={songs.total ? 'Your saved songs have no genre data yet.' : 'Save a song to see genres.'}
        />
        {songs.total > 0 && songs.withGenres < songs.total && (
          <p className="text-xs text-muted">
            {songs.withGenres} of {songs.total} songs have genre data.
          </p>
        )}
      </Panel>
    </div>
  )
}
