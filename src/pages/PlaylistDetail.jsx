import { useEffect, useRef, useState } from 'react'
import { ArrowDownUp, ArrowLeft, ArrowRightLeft, Clock, ExternalLink, Heart, Play, Plus, Search, Shuffle } from 'lucide-react'
import PlaylistSongRow, { PLAYLIST_COLUMNS } from '../components/songs/PlaylistSongRow'
import SourceFilter from '../components/songs/SourceFilter'
import { getPlaylistSongs, NotOwnedError, replaceTracks } from '../spotify/api'
import { useSpotify } from '../spotify/useSpotify'
import { usePlayer } from '../spotify/usePlayer'
import { matchesSearch } from '../lib/search'
import { playlistCache } from '../lib/playlistCache'
import { MODES, averageOf, distance, stateFor, targetFor } from '../lib/moodTags'
import { applySwap, isGoodMatch, placeSongs, planSwap } from '../lib/playlistMood'
import { fillGenres, topGenres } from '../lib/genreMatch'
import { discoverSongs } from '../picks'
import { isLastfmConfigured } from '../services/lastfm'
import { getAudioFeatures } from '../services/reccobeats'
import { stressValue, useRatings } from '../ratings'
import ConfirmRemove from '../components/playlists/ConfirmRemove'
import SwapPreview from '../components/playlists/SwapPreview'
import Skeleton, { SkeletonPlaylistRow, Spinner } from '../components/ui/Skeleton'

const cache = playlistCache
const ORIGINAL = 'Original'
const FROM_CHAT = 'From chat'
const FROM_SPOTIFY = 'From Spotify'
const FIT_SONGS = 200
const EXTEND_BY = 10
const EXISTING_FEATURES = 300
const SYNC_TEXT = { saving: 'Updating Spotify…', saved: 'Spotify playlist updated', error: 'Couldn’t update Spotify. Try again.' }

function shuffled(songs) {
  const copy = [...songs]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function sortByFit(songs, features, target) {
  const gap = (song) => {
    const d = distance(features[song.id], target)
    return Number.isFinite(d) ? d : Infinity
  }
  return [...songs].sort((a, b) => gap(a) - gap(b) || 0)
}

const totalLength = (songs) => {
  const minutes = Math.round(songs.reduce((sum, s) => sum + (s.durationMs || 0), 0) / 60000)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

export default function PlaylistDetail({ playlist, songs: fixedSongs, onBack, isSaved, onSave }) {
  const { profile, listening, liked, likedLoad, removeSong, addSongs } = useSpotify()
  const { ratings } = useRatings()
  const { play, canPlay } = usePlayer()
  const notMine = profile?.id && playlist.ownerId && playlist.ownerId !== profile.id && !playlist.collaborative
  const fixed = Boolean(fixedSongs)
  const [fetched, setState] = useState(() =>
    cache.has(playlist.id) ? { status: 'ready', songs: cache.get(playlist.id) } : { status: 'loading', songs: [] }
  )
  const state = fixed ? { status: 'ready', songs: fixedSongs } : fetched
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState(null)
  const [view, setView] = useState(ORIGINAL)
  const [source, setSource] = useState(FROM_SPOTIFY)
  const [sync, setSync] = useState(null)
  const [extend, setExtend] = useState(null)
  const [swap, setSwap] = useState(null)
  const [lastSwap, setLastSwap] = useState(null)
  const originalOrder = useRef(null)
  const [features, setFeatures] = useState({})
  const canRemove = !fixed && !(profile?.id && playlist.ownerId && playlist.ownerId !== profile.id)

  useEffect(() => {
    if (fixed || cache.has(playlist.id)) return
    if (notMine) {
      setState({ status: 'not-owned', songs: [] })
      return
    }
    let cancelled = false
    getPlaylistSongs(playlist.id)
      .then((songs) => {
        cache.set(playlist.id, songs)
        if (!cancelled) setState({ status: 'ready', songs })
      })
      .catch((err) => {
        if (!cancelled) setState({ status: err instanceof NotOwnedError ? 'not-owned' : 'error', songs: [], error: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [playlist.id, notMine, fixed])

  const today = ratings.filter((r) => new Date(r.at).toDateString() === new Date().toDateString())
  const moodState = today.length ? stateFor({ stress: stressValue(today[0].rating), recent: today.map((r) => stressValue(r.rating)).reverse() }) : null
  const mood = moodState?.mood ?? null
  const lifting = view === MODES.lift
  const adjusting = Boolean(mood) && view !== ORIGINAL
  const ready = state.status === 'ready'

  useEffect(() => {
    if (!adjusting || !ready) return
    let cancelled = false
    getAudioFeatures(state.songs.slice(0, FIT_SONGS).map((s) => s.id))
      .then((found) => !cancelled && setFeatures(found))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [adjusting, ready, state.songs])

  const canExtend = ready && !fixed && canRemove && state.songs.length > 0
  const canSync = ready && !fixed && canRemove && playlist.count === state.songs.length

  const changeView = async (next) => {
    if (sync === 'saving') return
    setView(next)
    setLastSwap(null)
    setSwap(null)
    if (!canSync || !mood) return

    let order
    try {
      if (next === ORIGINAL) {
        order = originalOrder.current
      } else {
        originalOrder.current ??= state.songs
        const found = await getAudioFeatures(state.songs.slice(0, FIT_SONGS).map((s) => s.id))
        order = sortByFit(state.songs, found, targetFor(mood, next === MODES.lift, moodState))
      }
      if (!order) return
      setSync('saving')
      await replaceTracks(playlist.id, order.map((s) => s.uri ?? `spotify:track:${s.id}`))
      cache.set(playlist.id, order)
      setState({ status: 'ready', songs: order })
      setSync('saved')
    } catch {
      setSync('error')
    }
  }

  const extendPlaylist = async () => {
    if (!isLastfmConfigured()) return setExtend({ status: 'done', text: 'Add a Last.fm key to find new songs.' })
    setExtend({ status: 'loading' })
    setLastSwap(null)
    try {
      const existing = state.songs
      const known = await getAudioFeatures(existing.slice(0, EXISTING_FEATURES).map((s) => s.id))
      const sound = averageOf(Object.values(known).filter(Boolean))
      const stayIn = topGenres(await fillGenres(existing.slice(0, 100)))
      const trace = {}
      const found = await discoverSongs({
        top: listening.filter((s) => s.top),
        library: existing,
        pool: listening,
        focus: existing,
        stayIn,
        sound: Object.keys(sound).length ? sound : null,
        trace,
        mood,
        state: moodState,
        lifting,
        count: EXTEND_BY,
      })
      if (!found.length) {
        if (trace.failed && !trace.onSpotify) return setExtend({ status: 'done', text: trace.error })
        return setExtend({ status: 'done', text: 'No new songs found right now.' })
      }

      await addSongs(playlist.id, found)
      let songs = [...existing, ...found]
      let text = `Added ${found.length} songs to the end.`
      if (playlist.count === existing.length) {
        try {
          const added = await getAudioFeatures(found.map((s) => s.id))
          const placed = placeSongs(existing, found, { ...known, ...added })
          await replaceTracks(playlist.id, placed.map((s) => s.uri ?? `spotify:track:${s.id}`))
          songs = placed
          text = `Added ${found.length} songs, placed where they fit.`
        } catch {
          songs = [...existing, ...found]
        }
      }
      cache.set(playlist.id, songs)
      originalOrder.current = null
      setState({ status: 'ready', songs })
      setExtend({ status: 'done', text })
    } catch {
      setExtend({ status: 'done', text: 'Couldn’t extend the playlist. Try again.' })
    }
  }

  const poorFits = adjusting
    ? state.songs.filter((s) => {
        const d = distance(features[s.id], targetFor(mood, lifting, moodState))
        return Number.isFinite(d) && !isGoodMatch(d)
      }).length
    : 0

  const startSwap = async () => {
    if (swap?.status === 'planning') return
    setSwap({ status: 'planning', checking: null, progress: 0.1 })
    const update = (patch) => setSwap((s) => (s?.status === 'planning' ? { ...s, ...patch } : s))
    try {
      const plan = await planSwap({
        songs: state.songs,
        mood,
        state: moodState,
        lifting,
        library: liked,
        listening,
        onLeaving: (ids) => update({ checking: new Set(ids) }),
        onProgress: (progress) => update({ progress }),
      })
      setSwap(plan ? { status: 'ready', plan } : { status: 'none' })
    } catch {
      setSwap({ status: 'none' })
    }
  }

  const applySwapPairs = async (pairs) => {
    const plan = swap.plan
    const base = applySwap(state.songs, pairs)
    const found = { ...features, ...plan.features }
    const order = sortByFit(base, found, plan.target)
    await replaceTracks(playlist.id, order.map((s) => s.uri ?? `spotify:track:${s.id}`))
    setLastSwap({ songs: state.songs, original: originalOrder.current })
    originalOrder.current = applySwap(originalOrder.current ?? state.songs, pairs)
    cache.set(playlist.id, order)
    setFeatures(found)
    setState({ status: 'ready', songs: order })
    setSync('saved')
    setSwap(null)
  }

  const undoSwap = async () => {
    if (!lastSwap || sync === 'saving') return
    setSync('saving')
    try {
      await replaceTracks(playlist.id, lastSwap.songs.map((s) => s.uri ?? `spotify:track:${s.id}`))
      cache.set(playlist.id, lastSwap.songs)
      originalOrder.current = lastSwap.original
      setState({ status: 'ready', songs: lastSwap.songs })
      setLastSwap(null)
      setSync('saved')
    } catch {
      setSync('error')
    }
  }

  const isLiked = Boolean(playlist.liked)
  const listSongs = isLiked ? state.songs.filter((s) => (source === FROM_CHAT ? s.source === 'chat' : s.source !== 'chat')) : state.songs
  const ordered = adjusting ? sortByFit(state.songs, features, targetFor(mood, lifting, moodState)) : listSongs

  const copies = removing ? state.songs.filter((s) => s.id === removing.id).length : 0

  const confirmRemove = async () => {
    await removeSong(playlist.id, removing, copies)
    setLastSwap(null)
    const songs = state.songs.filter((s) => s.id !== removing.id)
    cache.set(playlist.id, songs)
    setState({ status: 'ready', songs })
    setRemoving(null)
  }

  const shown = ordered.filter((s) => matchesSearch(query, s.title, s.artist, s.album))
  const summary = state.status === 'ready' ? `${listSongs.length} songs, ${totalLength(listSongs)}` : playlist.count !== null ? `${playlist.count} songs` : ''

  const body = () => {
    if (state.status === 'loading') {
      return (
        <div className="flex flex-col gap-2.5">
          <p role="status" className="sr-only">
            Loading songs
          </p>
          {Array.from({ length: Math.min(playlist.count || 8, 8) }, (_, i) => (
            <SkeletonPlaylistRow key={i} index={i} columns={PLAYLIST_COLUMNS} />
          ))}
        </div>
      )
    }
    if (state.status === 'not-owned') {
      return <p className="text-[15px] text-muted">Spotify only shares the songs in playlists you own. Open it in Spotify to see what’s inside.</p>
    }
    if (state.status === 'error') return <p className="text-[15px] text-muted">{state.error} Try again in a moment.</p>
    if (!state.songs.length) return <p className="text-[15px] text-muted">This playlist doesn’t have any songs yet.</p>
    if (!listSongs.length) return <p className="text-[15px] text-muted">{source === FROM_CHAT ? 'No songs saved from chat yet.' : 'No songs from Spotify yet.'}</p>
    if (!shown.length) return <p className="text-[15px] text-muted">No songs match “{query}”.</p>

    return (
      <div className="flex flex-col gap-2.5">
        <div className={`${PLAYLIST_COLUMNS} border-b border-line px-3.5 pb-2 text-[13px] text-muted`}>
          <span>#</span>
          <span>Title</span>
          <span className="hidden lg:block">Album</span>
          <span className="hidden xl:block">Date added</span>
          <Clock size={15} aria-label="Duration" />
          <span />
          <span />
        </div>
        {shown.map((song, i) => (
          <PlaylistSongRow
            key={`${song.id}-${state.songs.indexOf(song)}`}
            song={song}
            index={ordered.indexOf(song)}
            saved={isSaved(song.id)}
            onSave={onSave}
            onRemove={canRemove ? setRemoving : undefined}
            onPlay={() => play(shown, i)}
            checking={swap?.status === 'planning' && swap.checking?.has(song.id)}
          />
        ))}
        {extend?.status === 'loading' && (
          <div className="flex flex-col gap-2.5 border-l-[3px] border-teal pl-2.5">
            <p role="status" className="text-[13px] font-semibold text-teal">
              Adding {EXTEND_BY} songs
            </p>
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonPlaylistRow key={i} index={i + 2} columns={PLAYLIST_COLUMNS} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-5 px-4 py-5 md:px-8 md:py-8 xl:px-10">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 self-start text-[15px] font-semibold text-teal">
        <ArrowLeft size={18} />
        Playlists
      </button>

      <div className="flex items-end gap-5">
        {playlist.liked ? (
          <div className="flex size-[140px] shrink-0 items-center justify-center rounded-[14px] bg-teal text-white">
            <Heart size={56} fill="currentColor" />
          </div>
        ) : playlist.image ? (
          <img src={playlist.image} alt="" className="size-[140px] shrink-0 rounded-[14px] object-cover" />
        ) : (
          <div className="size-[140px] shrink-0 rounded-[14px] bg-art" />
        )}
        <div className="min-w-0">
          <h1 className="truncate font-serif text-[30px] font-semibold">{playlist.name}</h1>
          {summary && <p className="mt-1 text-[15px] text-muted">{summary}</p>}
          {isLiked && likedLoad && (
            <p role="status" className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
              <Spinner size={13} />
              {likedLoad.total ? `Loading more from Spotify: ${likedLoad.have} of ${likedLoad.total}` : 'Checking Spotify for more liked songs…'}
            </p>
          )}
          {ready && canPlay && listSongs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => play(ordered)}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-teal px-5 text-sm font-semibold text-white"
              >
                <Play size={16} fill="currentColor" aria-hidden="true" />
                Play
              </button>
              <button
                type="button"
                onClick={() => play(shuffled(ordered))}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-teal px-5 text-sm font-semibold text-teal"
              >
                <Shuffle size={16} aria-hidden="true" />
                Shuffle
              </button>
            </div>
          )}
          {playlist.url && (
            <a href={playlist.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-teal underline">
              <ExternalLink size={14} />
              Open in Spotify
            </a>
          )}
        </div>
      </div>

      {ready && state.songs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-12 w-full max-w-[420px] items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3.5">
            <Search size={18} className="text-teal" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this playlist"
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-hint"
            />
          </label>
          {isLiked ? (
            <SourceFilter
              value={source}
              onChange={setSource}
              options={[FROM_CHAT, FROM_SPOTIFY].map((id) => ({ id, count: state.songs.filter((s) => (s.source === 'chat') === (id === FROM_CHAT)).length }))}
            />
          ) : mood ? (
            <SourceFilter
              icon={ArrowDownUp}
              value={view}
              onChange={changeView}
              options={[ORIGINAL, MODES.match, MODES.lift].map((id) => ({ id }))}
            />
          ) : (
            <p className="text-[13px] text-muted">Rate your stress on Home to sort this playlist by mood.</p>
          )}
          {canExtend && (
            <button
              type="button"
              onClick={extendPlaylist}
              disabled={extend?.status === 'loading'}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-teal px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {extend?.status === 'loading' ? <Spinner /> : <Plus size={16} aria-hidden="true" />}
              {extend?.status === 'loading' ? 'Finding songs…' : 'Extend'}
            </button>
          )}
          {extend?.text && (
            <p role="status" className="text-[13px] text-muted">
              {extend.text}
            </p>
          )}
          {sync && mood && (
            <p role="status" className={`text-[13px] ${sync === 'error' ? 'text-danger' : 'text-muted'}`}>
              {SYNC_TEXT[sync]}
            </p>
          )}
        </div>
      )}

      {adjusting && canSync && (poorFits > 0 || lastSwap || swap?.status === 'none') && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-teal-soft px-4 py-3">
          <p role="status" className="text-[15px] text-teal">
            {swap?.status === 'none'
              ? 'No better fits found right now.'
              : lastSwap && sync === 'saved'
                ? 'Songs swapped on Spotify.'
                : `${poorFits} ${poorFits === 1 ? 'song fits' : 'songs fit'} poorly right now`}
          </p>
          <div className="flex items-center gap-3">
            {lastSwap && sync === 'saved' && (
              <button type="button" onClick={undoSwap} className="text-sm font-semibold text-teal underline">
                Undo swap
              </button>
            )}
            {poorFits > 0 && (
              <button
                type="button"
                onClick={startSwap}
                disabled={swap?.status === 'planning'}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-teal bg-surface px-4 text-sm font-semibold text-teal disabled:opacity-50"
              >
                {swap?.status === 'planning' ? <Spinner /> : <ArrowRightLeft size={16} aria-hidden="true" />}
                {swap?.status === 'planning' ? 'Finding fits…' : 'Swap songs'}
              </button>
            )}
          </div>
          {swap?.status === 'planning' && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-teal transition-[width] duration-500 ease-out" style={{ width: `${Math.round(swap.progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {body()}

      {canExtend && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-line px-4 py-3">
          <p className="text-[15px] text-muted">{extend?.text ?? `Playlist feels familiar? Add ${EXTEND_BY} new songs that fit.`}</p>
          <button
            type="button"
            onClick={extendPlaylist}
            disabled={extend?.status === 'loading'}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-teal px-4 text-sm font-semibold text-teal disabled:opacity-50"
          >
            {extend?.status === 'loading' ? <Spinner /> : <Plus size={16} aria-hidden="true" />}
            {extend?.status === 'loading' ? 'Finding songs…' : 'Extend playlist'}
          </button>
        </div>
      )}

      {swap?.status === 'ready' && (
        <SwapPreview
          plan={swap.plan}
          moodLabel={view === MODES.lift ? 'Ease my stress' : 'Match my mood'}
          onApply={applySwapPairs}
          onCancel={() => setSwap(null)}
        />
      )}

      {removing && (
        <ConfirmRemove
          song={removing}
          playlistName={playlist.name}
          copies={copies}
          onConfirm={confirmRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  )
}