import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Play, Sparkles } from 'lucide-react'
import SpotifyError from './SpotifyError'
import { useSpotify } from '../../spotify/useSpotify'
import { usePlayer } from '../../spotify/usePlayer'
import { getPlaylistSongs } from '../../spotify/api'
import { playlistCache } from '../../lib/playlistCache'
import IconButton from '../ui/IconButton'
import Skeleton, { SkeletonLines } from '../ui/Skeleton'
import MixBuild from './MixBuild'
import Collapse from '../ui/Collapse'
import { useMixBuild } from './useMixBuild'
import { isGoodMatch, matchPercent, profilePlaylists, rankProfiles } from '../../lib/playlistMood'

export default function PlaylistPick({ state, savedSongs, onOpen }) {
  const mood = state?.mood ?? null
  const { status, profile, playlists, listening } = useSpotify()
  const [profiles, setProfiles] = useState(null)
  const [error, setError] = useState(null)
  const { progress, run } = useMixBuild()

  useEffect(() => {
    if (status !== 'connected' || !profile?.id) return
    let cancelled = false
    profilePlaylists(playlists, profile.id)
      .then((result) => !cancelled && setProfiles(result))
      .catch(() => !cancelled && setProfiles([]))
    return () => {
      cancelled = true
    }
  }, [status, profile?.id, playlists])

  const best = useMemo(() => (profiles && mood ? rankProfiles(profiles, state.target)[0] : null), [profiles, mood, state])

  const build = async () => {
    setError(null)
    try {
      await run({ mood, state, saved: savedSongs, listening })
    } catch (err) {
      setError(err)
    }
  }

  if (!mood) return <p className="text-sm text-muted">Rate your stress above to get a playlist pick.</p>
  if (status !== 'connected') return <p className="text-sm text-muted">Connect Spotify to get playlist picks.</p>
  if (!profiles) {
    return (
      <div className="flex w-full items-center gap-4">
        <p role="status" className="sr-only">
          Finding your best match
        </p>
        <Skeleton className="size-16 shrink-0 rounded-[12px]" />
        <SkeletonLines title="w-1/2" sub="w-1/4" />
        <Skeleton className="size-11 shrink-0 rounded-full" />
      </div>
    )
  }

  const matched = best && isGoodMatch(best.distance)

  const done = Boolean(progress?.mix)
  const buildRow = (
    <button
      type="button"
      onClick={build}
      className="flex w-full items-center gap-2 border-t border-line pt-3 text-left text-[15px] font-semibold text-teal"
    >
      <Sparkles size={17} aria-hidden="true" />
      <span className="flex-1">Build a new mix</span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  )

  return (
    <div className="flex w-full flex-col items-start">
      {progress ? (
        <>
          {matched && (
            <Collapse open={!done}>
              <div className="pb-3 opacity-50">
                <MatchCard best={best} onOpen={onOpen} compact />
              </div>
            </Collapse>
          )}
          <div
            className={`w-full border-t transition-[border-color,padding] duration-[450ms] motion-reduce:transition-none ${
              matched && !done ? 'border-line pt-3' : 'border-transparent pt-0'
            }`}
          >
            <MixBuild progress={progress} onOpen={onOpen} bare wide />
          </div>
          {matched && (
            <Collapse open={done} className={done ? 'delay-[180ms]' : ''}>
              <div className="pt-4">
                <AlsoFits best={best} onOpen={onOpen} />
              </div>
            </Collapse>
          )}
          <Collapse open={done}>
            <div className="pt-3">{buildRow}</div>
          </Collapse>
        </>
      ) : (
        <div className="flex w-full flex-col items-start gap-3">
          {matched ? <MatchCard best={best} onOpen={onOpen} /> : <p className="text-sm text-muted">None of your playlists fit how you feel right now.</p>}
          {buildRow}
        </div>
      )}
      <SpotifyError error={error} />
    </div>
  )
}

function MatchCard({ best, onOpen, compact }) {
  const { playlist } = best
  const { play, notify, canPlay } = usePlayer()
  const [loading, setLoading] = useState(false)

  const start = async () => {
    setLoading(true)
    try {
      let songs = playlistCache.get(playlist.id)
      if (!songs) {
        songs = await getPlaylistSongs(playlist.id)
        playlistCache.set(playlist.id, songs)
      }
      await play(songs)
    } catch {
      notify('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => onOpen(playlist.id)} className="flex min-w-0 items-center gap-4 text-left">
        {playlist.image ? (
          <img src={playlist.image} alt="" className={`${compact ? 'size-11 rounded-[10px]' : 'size-16 rounded-[12px]'} shrink-0 object-cover transition-all duration-300`} />
        ) : (
          <div className={`${compact ? 'size-11 rounded-[10px]' : 'size-16 rounded-[12px]'} shrink-0 bg-art transition-all duration-300`} />
        )}
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">
            {playlist.name} <span className="ml-1.5 text-teal">{matchPercent(best.distance)}% match</span>
          </p>
        </div>
      </button>
      {canPlay && (
        <IconButton icon={Play} label={loading ? 'Loading playlist' : `Play ${playlist.name}`} primary size={compact ? 36 : 44} onClick={loading ? undefined : start} />
      )}
    </div>
  )
}

function AlsoFits({ best, onOpen }) {
  const { playlist } = best
  return (
    <button type="button" onClick={() => onOpen(playlist.id)} className="flex w-full min-w-0 items-center gap-2 text-left text-[13px] text-muted">
      {playlist.image ? (
        <img src={playlist.image} alt="" className="size-6 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="size-6 shrink-0 rounded-md bg-art" />
      )}
      <span className="min-w-0 truncate">
        Also fits: <span className="font-semibold text-ink">{playlist.name}</span> · {matchPercent(best.distance)}%
      </span>
      <span className="ml-auto shrink-0 font-semibold text-teal">Open</span>
    </button>
  )
}
