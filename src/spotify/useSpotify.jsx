import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { hasToken, login, logout, ReconnectError } from './auth'
import { addTracks, createPlaylist as createPlaylistRequest, getListening, getPlaylists, getProfile, likeTrack, removeTracks, unlikeTrack, deletePlaylist, restorePlaylist, cooldownLeft } from './api'
import { playlistCache } from '../lib/playlistCache'
import { getBaseline, refreshBaseline, setBaseline } from '../lib/baseline'
import { useAccount } from '../account'
import { loadLikedSongs, removeLikedSong, saveLikedSong } from '../lib/likedSync'
import { forgetAllSaved, forgetSaved, loadSaved, saveData } from '../lib/spotifyStore'

const SpotifyContext = createContext(null)
const empty = { profile: null, liked: [], playlists: [], listening: [] }

const LIBRARY = 'library'
const FIRST_LIKED = 500

const readSaved = (userId) => loadSaved(LIBRARY, userId).then((saved) => (saved?.data ? saved : null)).catch(() => null)

export function SpotifyProvider({ children }) {
  const { user, ready } = useAccount()
  const userId = user?.id ?? null
  const [status, setStatus] = useState(hasToken() ? 'syncing' : 'disconnected')
  const [data, setData] = useState(empty)
  const [error, setError] = useState(null)
  const [likedLoad, setLikedLoad] = useState(null)
  const inFlight = useRef(false)
  const meta = useRef({ at: 0, full: false })
  const fromSaved = useRef(false)
  const latest = useRef(empty)
  const [, setBaselineState] = useState(getBaseline)

  const applyCache = useCallback(
    (cached) => {
      meta.current = { at: cached.at, full: cached.full }
      fromSaved.current = true
      setData(cached.data)
      setError(null)
      setStatus('connected')
    },
    []
  )

  const load = useCallback(
    async (force) => {
      if (inFlight.current) return
      if (!hasToken()) return setStatus('disconnected')

      inFlight.current = true
      try {
        if (!force) {
          const saved = await readSaved(userId)
          if (saved) return applyCache(saved)
        }

        if (cooldownLeft() > 0) {
          const stale = await readSaved(userId)
          if (stale) applyCache(stale)
          else setStatus('error')
          try {
            await getProfile()
          } catch (err) {
            setError(err.message)
          }
          return
        }

        setStatus('syncing')
        setError(null)
        const [profile, playlists] = await Promise.all([getProfile(), getPlaylists()])
        const before = new Map(latest.current.playlists.map((p) => [p.id, p.snapshot]))
        playlists.forEach((p) => {
          if (before.has(p.id) && before.get(p.id) !== p.snapshot) {
            playlistCache.delete(p.id)
            forgetSaved(`playlist:${p.id}`, userId).catch(() => {})
          }
        })
        setData((prev) => ({ ...prev, profile, playlists }))
        setStatus('connected')
        setLikedLoad({ have: 0, total: 0 })

        const [liked, listening] = await Promise.allSettled([loadLikedSongs(userId, FIRST_LIKED, (have, total) => setLikedLoad({ have, total })), getListening()])
        const failed = [liked, listening].find((r) => r.status === 'rejected')
        if (failed?.reason instanceof ReconnectError) throw failed.reason

        const parts = {}
        if (liked.status === 'fulfilled') parts.liked = liked.value.songs
        if (listening.status === 'fulfilled') parts.listening = listening.value
        if (failed) setError(failed.reason.message)
        else meta.current = { at: Date.now(), full: liked.value.full }
        setData((prev) => ({ ...prev, ...parts }))
      } catch (err) {
        setError(err.message)
        setStatus(err instanceof ReconnectError ? 'expired' : 'error')
      } finally {
        setLikedLoad(null)
        inFlight.current = false
      }
    },
    [applyCache, userId]
  )

  const sync = useCallback(() => load(true), [load])

  useEffect(() => {
    const top = data.listening.filter((s) => s.top)
    if (status !== 'connected' || !top.length) return
    refreshBaseline({ medium: top }).then((next) => next && setBaselineState(next))
  }, [data.listening, status])

  useEffect(() => {
    latest.current = data
    if (fromSaved.current) {
      fromSaved.current = false
      return
    }
    if (status === 'connected' && meta.current.at) saveData(LIBRARY, { at: meta.current.at, full: meta.current.full, data }, userId).catch(() => {})
  }, [data, status, userId])

  const createPlaylist = useCallback(async (name) => {
    const playlist = await createPlaylistRequest(name)
    setData((prev) => ({ ...prev, playlists: [playlist, ...prev.playlists] }))
    return playlist
  }, [])

  const addSongs = useCallback(async (playlistId, songs) => {
    const uris = songs.map((s) => s.uri ?? (s.id ? `spotify:track:${s.id}` : null)).filter(Boolean)
    if (!uris.length) throw new Error('These songs can’t be added to a playlist.')
    await addTracks(playlistId, uris)
    playlistCache.delete(playlistId)
    setData((prev) => ({
      ...prev,
      playlists: prev.playlists.map((p) => (p.id === playlistId ? { ...p, count: (p.count ?? 0) + uris.length } : p)),
    }))
  }, [])

  const removeSong = useCallback(async (playlistId, song, copies = 1) => {
    await removeTracks(playlistId, [song.uri ?? `spotify:track:${song.id}`])
    playlistCache.delete(playlistId)
    setData((prev) => ({
      ...prev,
      playlists: prev.playlists.map((p) => (p.id === playlistId ? { ...p, count: Math.max(0, (p.count ?? 0) - copies) } : p)),
    }))
  }, [])

  const removePlaylists = useCallback(async (list) => {
    const results = await Promise.allSettled(list.map((p) => deletePlaylist(p.id)))
    const done = list.filter((_, i) => results[i].status === 'fulfilled')
    const failure = results.find((r) => r.status === 'rejected')
    if (done.length) {
      setData((prev) => ({ ...prev, playlists: prev.playlists.filter((p) => !done.some((d) => d.id === p.id)) }))
    }
    if (failure && !done.length) throw failure.reason
    return { done, failed: list.length - done.length }
  }, [])

  const restorePlaylists = useCallback(async (list, order) => {
    const results = await Promise.allSettled(list.map((p) => restorePlaylist(p.id)))
    const back = list.filter((_, i) => results[i].status === 'fulfilled')
    if (back.length) {
      const rank = (p) => (order.includes(p.id) ? order.indexOf(p.id) : order.length)
      setData((prev) => ({
        ...prev,
        playlists: [...prev.playlists, ...back.filter((b) => !prev.playlists.some((p) => p.id === b.id))].sort((a, b) => rank(a) - rank(b)),
      }))
    }
    if (back.length < list.length) throw new Error('Spotify couldn’t restore every playlist. Check your Spotify library.')
  }, [])

  const likeSong = useCallback(async (song) => {
    try {
      await likeTrack(song.id)
      setData((prev) => (prev.liked.some((s) => s.id === song.id) ? prev : { ...prev, liked: [song, ...prev.liked] }))
      saveLikedSong(userId, song)
    } catch (err) {
      setError(err.code === 'scope' ? 'Reconnect Spotify to sync liked songs.' : err.message)
    }
  }, [userId])

  const unlikeSong = useCallback(async (song) => {
    try {
      await unlikeTrack(song.id)
      setData((prev) => ({ ...prev, liked: prev.liked.filter((s) => s.id !== song.id) }))
      removeLikedSong(userId, song.id)
    } catch (err) {
      setError(err.code === 'scope' ? 'Reconnect Spotify to sync liked songs.' : err.message)
    }
  }, [userId])

  const addToPlaylist = useCallback((playlistId, song) => addSongs(playlistId, [song]), [addSongs])

  const connect = useCallback(() => {
    forgetAllSaved(userId).catch(() => {})
    setError(null)
    login().catch((err) => setError(err.message))
  }, [userId])

  const disconnect = useCallback(() => {
    forgetAllSaved(null).catch(() => {})
    logout()
    setBaseline(null)
    setBaselineState(null)
    setData(empty)
    setError(null)
    setStatus('disconnected')
  }, [])

  useEffect(() => {
    if (ready && hasToken()) load(false)
  }, [load, ready])

  return (
    <SpotifyContext.Provider value={{ status, error, likedLoad, ...data, sync, connect, disconnect, createPlaylist, addToPlaylist, addSongs, removeSong, likeSong, unlikeSong, removePlaylists, restorePlaylists }}>
      {children}
    </SpotifyContext.Provider>
  )
}

export function useSpotify() {
  const value = useContext(SpotifyContext)
  if (!value) throw new Error('useSpotify must be used inside SpotifyProvider')
  return value
}
