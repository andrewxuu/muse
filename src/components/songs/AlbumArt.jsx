import { Play } from 'lucide-react'
import { usePlayer } from '../../spotify/usePlayer'

export default function AlbumArt({ song, size = 40, onPlay }) {
  const { canPlay } = usePlayer()
  const style = { width: size, height: size }
  const art = song.image ? (
    <img src={song.image} alt="" style={style} className="rounded-lg object-cover" />
  ) : (
    <div style={style} className="rounded-lg bg-art" />
  )

  if (!song.uri || !onPlay || !canPlay) return <div className="shrink-0">{art}</div>

  return (
    <button
      type="button"
      aria-label={`Play ${song.title}`}
      onClick={onPlay}
      style={style}
      className="group relative shrink-0 overflow-hidden rounded-lg"
    >
      {art}
      <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <Play size={18} fill="currentColor" />
      </span>
    </button>
  )
}
