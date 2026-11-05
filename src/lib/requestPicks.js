import { recommendSongs } from '../services/llmSongs'
import { getAudioFeatures } from '../services/reccobeats'
import { searchArtistTracks } from '../spotify/api'
import { MODES, distance, targetFor } from './moodTags'
import { firstArtist, normalize, shuffle, songKey } from './filters'
import { fillGenres } from './genreMatch'

const PICKS = 3
const PER_ARTIST = 2
const BPM_PADS = [5, 10]
export const MAX_BPM_PAD = BPM_PADS.at(-1)
export const MOOD_WEIGHT = 0.35
const TEMPO_SCALE = 40
const GENRE_MISS = 0.3

const tempos = (t) => (typeof t === 'number' && t > 0 ? [t, t * 2, t / 2] : [])

export const tempoGap = (tempo, bpm) => {
  const mid = (bpm.min + bpm.max) / 2
  const options = tempos(tempo)
  return options.length ? Math.min(...options.map((t) => Math.abs(t - mid))) : Infinity
}

export const inBpm = (tempo, bpm, pad = 0) => tempos(tempo).some((t) => t >= bpm.min - pad && t <= bpm.max + pad)

export const hasAsk = (ask) => Boolean(ask && (ask.artists?.length || ask.genres?.length || ask.bpm || ask.sound || ask.notes))

export const genreHit = (names = [], wants = []) => {
  const have = names.map(normalize)
  return wants.map(normalize).some((w) => have.some((n) => n.includes(w) || w.includes(n)))
}

const finite = (n, fallback) => (Number.isFinite(n) ? n : fallback)

export async function rankForAsk(songs, ask, moodTarget, need) {
  if (!songs.length || !ask) return songs
  const features = await getAudioFeatures(songs.map((s) => s.id)).catch(() => ({}))
  let pool = songs
  if (ask.bpm) {
    for (const pad of BPM_PADS) {
      pool = songs.filter((s) => inBpm(features[s.id]?.tempo, ask.bpm, pad))
      if (pool.length >= need) break
    }
  }
  if (ask.genres?.length) pool = await fillGenres(pool).catch(() => pool)

  const hasMood = moodTarget && Object.keys(moodTarget).length
  const score = (s) => {
    const f = features[s.id]
    let total = 0
    if (ask.sound) total += finite(distance(f, ask.sound), 0.5)
    if (ask.bpm) total += finite(tempoGap(f?.tempo, ask.bpm) / TEMPO_SCALE, 1)
    if (ask.genres?.length && s.genres?.length && !genreHit(s.genres, ask.genres)) total += GENRE_MISS
    if (hasMood) total += MOOD_WEIGHT * finite(distance(f, moodTarget), 0.5)
    return total
  }
  return pool.map((s) => ({ s, d: score(s) })).sort((a, b) => a.d - b.d).map((x) => x.s)
}

export async function requestPicks({ request, ask = null, mood, state, mode, aim = null, taste, avoid, skip }) {
  const artist = ask?.artists?.[0]
  const [found, theirs] = await Promise.all([
    recommendSongs({ request, ask, mood, artists: taste, avoid, count: ask?.bpm ? PICKS * 4 : PICKS * 2 }),
    artist ? searchArtistTracks(artist).catch(() => []) : [],
  ])
  const seen = new Set(avoid.map((s) => songKey(s.artist, s.title)))
  const fresh = [...found, ...shuffle(theirs).slice(0, PICKS)].filter((s) => {
    const key = songKey(s.artist, s.title)
    if (skip.has(s.id) || seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!fresh.length) return fresh

  const lifting = mode === MODES.lift && Boolean(mood)
  const target = aim && !lifting ? aim : targetFor(mood, lifting, state)
  const ranked = await rankForAsk(fresh, ask ?? {}, target, PICKS)

  const out = []
  const artists = new Map()
  for (const s of ranked) {
    const name = firstArtist(s.artist).toLowerCase()
    if ((artists.get(name) ?? 0) >= PER_ARTIST && ranked.length - out.length > PICKS - out.length) continue
    artists.set(name, (artists.get(name) ?? 0) + 1)
    out.push(s)
    if (out.length === PICKS) break
  }
  return out
}

export const topArtists = (songs) => [...new Set(songs.slice(0, 20).map((s) => firstArtist(s.artist)))].slice(0, 8)
