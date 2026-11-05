import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getAccessToken, ReconnectError } from './auth'
import { startPlayback } from './api'
import { useSpotify } from './useSpotify'

const PlayerContext = createContext(null)
const MAX_QUEUE = 100

let sdkPromise = null

function loadSdk() {
  sdkPromise ??= new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify)
    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    script.onerror = () => {
      sdkPromise = null
      reject(new Error('Spotify’s player couldn’t load.'))
    }
    document.body.appendChild(script)
  })
  return sdkPromise
}

const toCurrent = (track) => ({
  id: track.linked_from?.id ?? track.id,
  uri: track.linked_from?.uri ?? track.uri,
  title: track.name,
  artist: track.artists.map((a) => a.name).join(', '),
  image: track.album?.images?.at(-1)?.url,
})

const VOLUME_KEY = 'moodbot:volume'

function savedVolume() {
  try {
    const value = Number(localStorage.getItem(VOLUME_KEY))
    return localStorage.getItem(VOLUME_KEY) !== null && value >= 0 && value <= 1 ? value : 0.8
  } catch {
    return 0.8
  }
}

export function PlayerProvider({ children }) {
  const { status, profile } = useSpotify()
  const connected = status === 'connected'
  const free = Boolean(profile?.product) && profile.product !== 'premium'
  const playerRef = useRef(null)
  const [volume, setVolumeState] = useState(savedVolume)
  const volumeRef = useRef(volume)
  const deviceRef = useRef(null)
  const positionRef = useRef({ position: 0, at: 0, paused: true })
  const [playback, setPlayback] = useState(null)
  const [pending, setPending] = useState(null)
  const [closed, setClosed] = useState(false)
  const [fault, setFault] = useState(null)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!connected || free) return
    let cancelled = false
    let player = null

    loadSdk()
      .then((Spotify) => {
        if (cancelled) return
        player = new Spotify.Player({
          name: 'Muse',
          volume: volumeRef.current,
          getOAuthToken: (cb) => getAccessToken().then(cb).catch(() => {}),
        })
        player.addListener('ready', ({ device_id }) => {
          deviceRef.current = device_id
          setFault(null)
        })
        player.addListener('not_ready', () => {
          deviceRef.current = null
        })
        player.addListener('player_state_changed', (state) => {
          if (!state) return
          const track = state.track_window.current_track
          positionRef.current = { position: state.position, at: Date.now(), paused: state.paused }
          setPlayback({
            ...toCurrent(track),
            paused: state.paused,
            duration: state.duration,
            hasPrev: state.track_window.previous_tracks.length > 0,
            hasNext: state.track_window.next_tracks.length > 0,
          })
          setPending((prev) => (prev && (prev.uri === track.uri || prev.uri === track.linked_from?.uri) ? null : prev))
        })
        player.addListener('authentication_error', () => setFault('reconnect'))
        player.addListener('account_error', () => setFault('premium'))
        player.addListener('initialization_error', () => setFault('unsupported'))
        player.addListener('playback_error', () => {
          setPending(null)
          setNotice('error')
        })
        player.connect()
        playerRef.current = player
      })
      .catch(() => setFault('unsupported'))

    return () => {
      cancelled = true
      player?.disconnect()
      playerRef.current = null
      deviceRef.current = null
    }
  }, [connected, free])

  const canPlay = !free && fault !== 'premium'

  const play = useCallback(
    async (input, index = 0) => {
      const queue = (Array.isArray(input) ? input : [input]).filter((s) => s?.uri)
      const song = queue[index]
      if (!song || !canPlay) return
      if (!connected) return setNotice('connect')
      if (fault) return setNotice(fault)
      const player = playerRef.current
      const device = deviceRef.current
      if (!player || !device) return setNotice('starting')

      player.activateElement()
      setNotice(null)
      setClosed(false)
      setPending({ id: song.id, uri: song.uri, title: song.title, artist: song.artist, image: song.image })

      const from = index >= MAX_QUEUE ? index : 0
      try {
        await startPlayback(
          device,
          queue.slice(from, from + MAX_QUEUE).map((s) => s.uri),
          index - from
        )
      } catch (err) {
        setPending(null)
        setNotice(err instanceof ReconnectError || err.status === 403 ? 'reconnect' : 'error')
      }
    },
    [connected, fault, canPlay]
  )

  const setVolume = useCallback((next) => {
    const value = Math.min(1, Math.max(0, next))
    volumeRef.current = value
    setVolumeState(value)
    playerRef.current?.setVolume(value)
    try {
      localStorage.setItem(VOLUME_KEY, String(value))
    } catch {
      return
    }
  }, [])

  const toggle = useCallback(() => playerRef.current?.togglePlay(), [])
  const next = useCallback(() => playerRef.current?.nextTrack(), [])
  const prev = useCallback(() => playerRef.current?.previousTrack(), [])
  const close = useCallback(() => {
    playerRef.current?.pause()
    setPending(null)
    setClosed(true)
  }, [])
  const dismissNotice = useCallback(() => setNotice(null), [])
  const notify = useCallback((type) => setNotice(type), [])

  const getPosition = useCallback(() => {
    const { position, at, paused } = positionRef.current
    return paused ? position : position + (Date.now() - at)
  }, [])

  const value = useMemo(() => {
    const live = connected && !closed ? (pending ? { ...pending, paused: false } : playback) : null
    return {
      current: live,
      currentId: live?.id ?? null,
      playing: Boolean(live) && !live.paused,
      duration: live?.duration ?? 0,
      hasPrev: Boolean(live?.hasPrev),
      hasNext: Boolean(live?.hasNext),
      notice,
      visible: Boolean(live) || Boolean(notice),
      canPlay,
      play,
      toggle,
      next,
      prev,
      close,
      dismissNotice,
      notify,
      getPosition,
      volume,
      setVolume,
    }
  }, [connected, closed, pending, playback, notice, canPlay, play, toggle, next, prev, close, dismissNotice, notify, getPosition, volume, setVolume])

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const value = useContext(PlayerContext)
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider')
  return value
}
