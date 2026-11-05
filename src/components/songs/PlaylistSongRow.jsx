import { Heart, Minus } from 'lucide-react'
import AlbumArt from './AlbumArt'
import IconButton from '../ui/IconButton'
import { usePlayer } from '../../spotify/usePlayer'

export const PLAYLIST_COLUMNS =
  'grid grid-cols-[28px_minmax(0,1fr)_52px_44px_44px] lg:grid-cols-[28px_minmax(0,2fr)_minmax(0,1.3fr)_52px_44px_44px] xl:grid-cols-[28px_minmax(0,2fr)_minmax(0,1.3fr)_112px_52px_44px_44px] items-center gap-2 sm:gap-4'

const formatDuration = (ms) => {
  const total = Math.round((ms || 0) / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export default function PlaylistSongRow({ song, index, saved, onSave, onRemove, onPlay, checking }) {
  const { currentId } = usePlayer()

  return (
    <div className={`${PLAYLIST_COLUMNS} rounded-[14px] border border-line bg-surface px-3.5 py-2.5 transition-opacity duration-300 ${checking ? 'opacity-50' : ''}`}>
      <span className="text-sm text-muted">{index + 1}</span>
      <div className="flex min-w-0 items-center gap-3">
        <AlbumArt song={song} onPlay={onPlay} />
        <div className="min-w-0">
          <p className={`truncate text-[15px] font-semibold ${currentId === song.id ? 'text-teal' : ''}`}>{song.title}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted">{song.artist}</p>
        </div>
        {checking && <span className="ml-auto shrink-0 rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-semibold text-teal">Checking</span>}
      </div>
      <p className="hidden truncate text-sm text-muted lg:block">{song.album}</p>
      <p className="hidden truncate text-sm text-muted xl:block">{formatDate(song.addedAt)}</p>
      <p className="text-sm tabular-nums text-muted">{formatDuration(song.durationMs)}</p>
      <IconButton icon={Heart} label={saved ? 'Saved' : 'Save song'} active={saved} onClick={() => onSave(song)} />
      {onRemove ? <IconButton icon={Minus} label={`Remove ${song.title} from playlist`} onClick={() => onRemove(song)} /> : <span />}
    </div>
  )
}
