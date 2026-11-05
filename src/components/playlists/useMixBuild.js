import { useCallback, useRef, useState } from 'react'
import { useSpotify } from '../../spotify/useSpotify'
import { NEW_MAX, buildFocusSongs, buildMoodSongs } from '../../lib/playlistMood'
import { playlistCache } from '../../lib/playlistCache'
import { mixName } from '../../lib/moodTags'
import { hasAsk } from '../../lib/requestPicks'

const STEP_MIN = 550
const TILE_GAP = 170
const REVEAL_GAP = 220

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function useMixBuild() {
  const { createPlaylist, addSongs } = useSpotify()
  const [progress, setProgress] = useState(null)
  const clock = useRef(0)

  const show = useCallback((patch, gap = STEP_MIN) => {
    const now = Date.now()
    const at = Math.max(now, clock.current + gap)
    clock.current = at
    const apply = () => setProgress((p) => p && { ...p, ...patch })
    if (at > now) setTimeout(apply, at - now)
    else apply()
    return pause(at - now)
  }, [])

  const run = useCallback(
    async ({ mood, focus = '', ask = null, ...options }) => {
      const label = focus || (ask?.bpm ? `${ask.bpm.min}-${ask.bpm.max} BPM` : '')
      const focused = Boolean(label) || hasAsk(ask)
      clock.current = Date.now()
      setProgress({ step: 'mood', detail: null, found: [], songs: [], shown: 0, mix: null })
      let found = []
      try {
        const build = focused ? buildFocusSongs : buildMoodSongs
        const result = await build({
          mood,
          focus: label || 'requested',
          ask,
          ...options,
          onStep: (step, detail = null) => show({ step, detail }),
          onFound: (list) => {
            const next = list.slice(0, NEW_MAX)
            const gap = reducedMotion() ? 0 : REVEAL_GAP
            for (let k = found.length + 1; k <= next.length; k++) show({ found: next.slice(0, k) }, gap)
            found = next
          },
        })
        if (!result.length) throw new Error('Couldn’t find enough songs yet. Try again.')
        const keep = new Set(result.map((s) => s.id))
        const seen = found.filter((s) => keep.has(s.id))
        const seenIds = new Set(seen.map((s) => s.id))
        const songs = [...seen, ...result.filter((s) => !seenIds.has(s.id))]
        await show({ step: 'save', detail: null, songs, shown: seen.length })

        const saving = (async () => {
          const playlist = await createPlaylist(label ? `${label.replace(/\b\w/g, (c) => c.toUpperCase())} mix` : mixName(mood))
          await addSongs(playlist.id, result)
          playlistCache.set(playlist.id, result)
          return playlist
        })()
        saving.catch(() => {})

        const gap = reducedMotion() ? 0 : TILE_GAP
        for (let i = seen.length + 1; i <= songs.length; i++) {
          setProgress((p) => p && { ...p, shown: i })
          if (gap) await pause(gap)
        }

        const playlist = await saving
        const mix = {
          id: playlist.id,
          name: playlist.name,
          count: result.length,
          minutes: Math.round(result.reduce((sum, s) => sum + (s.durationMs || 0), 0) / 60000),
          art: result.map((s) => s.image ?? null),
        }
        await pause(gap ? 300 : 0)
        setProgress((p) => p && { ...p, step: 'done', mix })
        return { mix, songs: result }
      } catch (err) {
        setProgress(null)
        throw err
      }
    },
    [createPlaylist, addSongs, show]
  )

  return { progress, run, reset: () => setProgress(null) }
}
