import { getAudioFeatures } from '../services/reccobeats'
import { getPlaylistSongs, searchArtistTracks } from '../spotify/api'
import { playlistCache } from './playlistCache'
import { FILTERS, firstArtist, normalize, shuffle, uniqueSongs } from './filters'
import { MODES, averageOf, distance, effectiveMood, stateFor, stateOf, targetFor, targetOf } from './moodTags'
import { focusSongs, llmSongs } from '../services/llmSongs'
import { MAX_BPM_PAD, MOOD_WEIGHT, genreHit, inBpm, rankForAsk, tempoGap, topArtists } from './requestPicks'
import { discoverSongs } from '../picks'
import { applyGenrePrefs, boostLiked, fillGenres, hasGenrePrefs, inGenres, matchGenre, topGenres } from './genreMatch'
import { loadGenrePrefs } from './genrePrefs'

const MAX_PLAYLISTS = 10
const MAX_SONGS = 100
const MIN_SONGS = 3
const FAR = 0.5
const AVOID_SHARE = 0.25
const LIKE_BONUS = 0.04
const GENRE_SONGS = 60
const PROFILE_KEY = 'moodbot:playlist-profiles'
const PROFILE_MS = 6 * 60 * 60 * 1000
const MIX_GENRES = 2
const MIN_COHESIVE = 8
const PEAK_AT = 0.65
const SWING = 0.08
const FLOW = ['energy', 'valence', 'danceability', 'acousticness']

export const NEW_MIN = 15
export const NEW_MAX = 20

export const moodForStress = (rating) => stateFor({ stress: rating }).mood

const targetFrom = (mood) => (typeof mood === 'string' ? targetOf(mood) : mood)

export const matchPercent = (d) => Math.max(0, Math.round((1 - d / FAR) * 100))
export const isGoodMatch = (d) => d <= FILTERS.maxMoodDistance

const sampleCache = new Map()

async function sampleOf(id) {
  if (playlistCache.has(id)) return playlistCache.get(id)
  if (!sampleCache.has(id)) sampleCache.set(id, await getPlaylistSongs(id, MAX_SONGS))
  return sampleCache.get(id)
}

function readProfiles() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) ?? {}
  } catch {
    return {}
  }
}

function writeProfiles(profiles) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles))
  } catch {
    return
  }
}

async function genreShares(songs, prefs) {
  if (!hasGenrePrefs(prefs) || !songs.length) return { avoid: 0, like: 0 }
  const filled = await fillGenres(songs)
  const share = (list) => filled.filter((s) => matchGenre(s.genres, list)).length / filled.length
  return { avoid: share(prefs.avoided), like: share(prefs.liked) }
}

const median = (list) => {
  const sorted = list.filter((n) => typeof n === 'number' && n > 0).sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
}

async function askShare(songs, ask) {
  if (!ask || !songs.length || !(ask.artists?.length || ask.genres?.length)) return null
  const wanted = (ask.artists ?? []).map(normalize)
  const filled = ask.genres?.length ? await fillGenres(songs).catch(() => songs) : songs
  const hit = (s) => wanted.some((w) => byArtist(s, w)) || (ask.genres?.length && genreHit(s.genres, ask.genres))
  return filled.filter(hit).length / filled.length
}

export async function profilePlaylists(playlists, ownerId, ask = null) {
  const prefs = loadGenrePrefs()
  const owned = playlists.filter((p) => p.ownerId === ownerId && p.count !== 0).slice(0, MAX_PLAYLISTS)
  const saved = readProfiles()
  const next = {}
  const results = await Promise.allSettled(
    owned.map(async (playlist) => {
      const hit = saved[playlist.id]
      if (hit && hit.count === playlist.count && Date.now() - hit.at < PROFILE_MS && (!hit.value || 'tempo' in hit.value)) {
        next[playlist.id] = hit
        return hit.value && { playlist, ...hit.value }
      }
      const songs = (await sampleOf(playlist.id)).slice(0, MAX_SONGS)
      const features = await getAudioFeatures(songs.map((s) => s.id))
      const found = songs.map((s) => features[s.id]).filter(Boolean)
      const value = found.length >= MIN_SONGS ? { profile: averageOf(found), tempo: median(found.map((f) => f.tempo)), songs: songs.slice(0, GENRE_SONGS) } : null
      if (Object.keys(features).length) next[playlist.id] = { count: playlist.count, at: Date.now(), value }
      return value && { playlist, ...value }
    })
  )
  for (const p of owned) if (!next[p.id] && saved[p.id]) next[p.id] = saved[p.id]
  writeProfiles(next)
  const profiled = results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
  const out = []
  for (const { songs, ...rest } of profiled) out.push({ ...rest, ...(await genreShares(songs, prefs)), share: await askShare(songs, ask) })
  return out
}

const MIN_SHARE = 0.25

function askDistance(p, mood, ask) {
  const m = distance(p.profile, targetFrom(mood))
  const parts = [[Number.isFinite(m) ? m : FAR, MOOD_WEIGHT]]
  if (ask.sound) parts.push([distance(p.profile, ask.sound), 1])
  if (ask.bpm) parts.push([Math.min(FAR, tempoGap(p.tempo, ask.bpm) / 80), 1])
  if (p.share != null) parts.push([(1 - p.share) * FAR, 1])
  const valid = parts.filter(([d]) => Number.isFinite(d))
  return valid.reduce((sum, [d, w]) => sum + d * w, 0) / valid.reduce((sum, [, w]) => sum + w, 0)
}

const passesAsk = (p, ask) => {
  if (!ask || !(ask.bpm || p.share != null)) return undefined
  return (!ask.bpm || inBpm(p.tempo, ask.bpm, MAX_BPM_PAD)) && (p.share == null || p.share >= MIN_SHARE)
}

export const rankProfiles = (profiles, mood, ask = null) => {
  const bonus = (p) => LIKE_BONUS * (p.like ?? 0)
  return profiles
    .filter((p) => (p.avoid ?? 0) <= AVOID_SHARE)
    .map((p) => ({ ...p, distance: ask ? askDistance(p, mood, ask) : distance(p.profile, targetFrom(mood)), fits: passesAsk(p, ask) }))
    .filter((p) => Number.isFinite(p.distance) && p.fits !== false)
    .sort((a, b) => a.distance - bonus(a) - (b.distance - bonus(b)))
}

export async function closestSongs(songs, mood, n = 25) {
  const features = await getAudioFeatures(songs.map((s) => s.id))
  const limit = FILTERS.maxMoodDistance + FILTERS.relaxBy
  return songs
    .map((song) => ({ song, d: distance(features[song.id], targetFrom(mood)) }))
    .filter((x) => x.d <= limit)
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.song)
}

export function describeProfile(p) {
  const traits = []
  if (p.energy < 0.4) traits.push('Low energy')
  else if (p.energy > 0.65) traits.push('High energy')
  if (p.valence > 0.6) traits.push('upbeat')
  else if (p.valence < 0.35) traits.push('moody')
  if (p.acousticness > 0.5) traits.push('acoustic')
  if (p.instrumentalness > 0.5) traits.push('instrumental')
  if (p.danceability > 0.65) traits.push('danceable')
  return traits.slice(0, 3).join(', ') || 'Balanced mix'
}

const unique = uniqueSongs

const energyCurve = (i, n, base, lifting) => {
  const t = n > 1 ? i / (n - 1) : 0
  if (lifting) return base + SWING - 2 * SWING * t
  return t < PEAK_AT ? base - SWING + 2 * SWING * (t / PEAK_AT) : base + SWING - 3 * SWING * ((t - PEAK_AT) / (1 - PEAK_AT))
}

export function flowGap(a, b) {
  const dims = FLOW.filter((k) => typeof a[k] === 'number' && typeof b[k] === 'number')
  const feel = dims.length ? Math.sqrt(dims.reduce((sum, k) => sum + (a[k] - b[k]) ** 2, 0) / dims.length) : 0
  const pace = typeof a.tempo === 'number' && typeof b.tempo === 'number' ? Math.min(1, Math.abs(a.tempo - b.tempo) / 60) : 0
  return feel + 0.25 * pace
}

export function placeSongs(songs, extra, features) {
  const order = [...songs]
  extra.forEach((song) => {
    const f = features[song.id]
    if (!f) return order.push(song)
    const artist = firstArtist(song.artist)
    let best = order.length
    let bestCost = Infinity
    for (let i = 0; i <= order.length; i++) {
      const prev = order[i - 1]
      const next = order[i]
      const a = prev && features[prev.id]
      const b = next && features[next.id]
      let cost = 1
      if (a && b) cost = flowGap(a, f) + flowGap(f, b) - flowGap(a, b)
      else if (a || b) cost = flowGap(a ?? b, f) + 0.1
      if ((prev && firstArtist(prev.artist) === artist) || (next && firstArtist(next.artist) === artist)) cost += 0.5
      if (cost < bestCost) [best, bestCost] = [i, cost]
    }
    order.splice(best, 0, song)
  })
  return order
}

export async function djOrder(songs, target, lifting) {
  try {
    const features = await getAudioFeatures(songs.map((s) => s.id))
    const withFeatures = songs.filter((s) => features[s.id])
    const rest = songs.filter((s) => !features[s.id])
    if (withFeatures.length < 3) return songs

    const base = typeof target.energy === 'number' ? target.energy : 0.5
    const pool = [...withFeatures]
    const out = []
    while (pool.length) {
      const want = energyCurve(out.length, withFeatures.length, base, lifting)
      const prev = out.at(-1)
      const before = out.at(-2)
      let best = 0
      let bestScore = Infinity
      pool.forEach((song, i) => {
        const f = features[song.id]
        let score = Math.abs((typeof f.energy === 'number' ? f.energy : want) - want)
        if (prev) {
          score += flowGap(features[prev.id], f)
          if (firstArtist(song.artist) === firstArtist(prev.artist)) score += 0.5
          else if (before && firstArtist(song.artist) === firstArtist(before.artist)) score += 0.2
        } else if (!song.isNew) {
          score -= 0.05
        }
        if (score < bestScore) [best, bestScore] = [i, score]
      })
      out.push(pool.splice(best, 1)[0])
    }
    return [...out, ...rest]
  } catch {
    return songs
  }
}

async function anchorGenres(listening, library, prefs) {
  const sample = await fillGenres([...listening.filter((s) => s.top).slice(0, 40), ...listening.slice(0, 40), ...library.slice(0, 80)])
  const ranked = topGenres(sample, 8)
  const preferred = ranked.filter((g) => prefs.liked.includes(g))
  return shuffle(preferred.length ? preferred : ranked).slice(0, MIX_GENRES)
}

const RECENT_KEY = 'moodbot:recent-mix'
const RECENT_MAX = 120

function readRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []
  } catch {
    return []
  }
}

function writeRecent(songs) {
  try {
    const ids = [...songs.map((s) => s.id), ...readRecent()].filter(Boolean)
    localStorage.setItem(RECENT_KEY, JSON.stringify([...new Set(ids)].slice(0, RECENT_MAX)))
  } catch {
    return
  }
}

export async function buildMoodSongs({ mood, state, mode = MODES.match, saved, listening, onStep = () => {}, onFound = () => {} }) {
  const lifting = mode === MODES.lift
  const target = targetFor(mood, lifting, state)
  const library = saved.filter((s) => s.id)
  const prefs = loadGenrePrefs()
  const stayIn = await anchorGenres(listening, library, prefs).catch(() => [])
  const recent = readRecent()
  let songs = []

  onStep('find', 'Looking for songs that fit')
  try {
    songs = unique(
      await discoverSongs({ top: listening.filter((s) => s.top), library, pool: listening, mood, state, lifting, stayIn, count: NEW_MAX, exclude: recent })
    )
  } catch {
    songs = []
  }
  onFound(songs)

  const fill = async (candidates, genres) => {
    try {
      const have = new Set([...songs.map((s) => s.id), ...recent])
      const { songs: allowed, liked } = await applyGenrePrefs(candidates.filter((s) => !have.has(s.id)), prefs)
      const inStyle = genres.length ? (await fillGenres(allowed)).filter((s) => inGenres(s, genres)) : allowed
      const near = boostLiked(await closestSongs(inStyle, target, NEW_MAX + 10), (s) => liked.has(s.id))
      songs = unique([...songs, ...near.slice(0, NEW_MAX - songs.length)])
    } catch {
      songs = unique(songs)
    }
    onFound(songs)
  }

  if (songs.length < NEW_MIN) {
    onStep('find', 'Checking your liked songs')
    await fill(library.slice(0, 200), stayIn)
  }
  if (songs.length < NEW_MIN) {
    onStep('find', 'Looking at what you play most')
    await fill(listening.filter((s) => s.id), stayIn)
  }

  if (songs.length < NEW_MIN) {
    onStep('find', 'Finding a few new ones')
    try {
      const asked = await llmSongs(stateOf(effectiveMood(mood, lifting)).ask, NEW_MAX - songs.length, songs)
      const allowed = (await applyGenrePrefs(asked, prefs)).songs
      const inStyle = stayIn.length ? (await fillGenres(allowed)).filter((s) => inGenres(s, stayIn)) : allowed
      songs = unique([...songs, ...inStyle])
    } catch {
      songs = unique(songs)
    }
    onFound(songs)
  }

  if (songs.length < MIN_COHESIVE) {
    await fill(library.slice(0, 200), [])
    if (songs.length < MIN_COHESIVE) await fill(listening.filter((s) => s.id), [])
  }

  onStep('order')
  const result = await djOrder(songs.slice(0, NEW_MAX), target, lifting)
  writeRecent(result)
  return result
}

const FOCUS_SHARE = 0.55
const FAMILIAR_SHARE = 0.5
const TASTE_GENRES = 5

async function tasteOf(listening, library, prefs) {
  const top = listening.filter((s) => s.top)
  const sample = await fillGenres([...top.slice(0, 40), ...listening.slice(0, 40), ...library.slice(0, 80)]).catch(() => [])
  const ranked = topGenres(sample, TASTE_GENRES + prefs.avoided.length).filter((g) => !prefs.avoided.includes(g))
  const liked = prefs.liked.filter((g) => !ranked.includes(g))
  return { artists: topArtists([...top, ...library]), genres: [...ranked, ...liked].slice(0, TASTE_GENRES) }
}

const byArtist = (song, want) => (song.artist ?? '').split(', ').some((a) => normalize(a) === want)

export async function buildFocusSongs({ focus, ask = null, mood, state, mode = MODES.match, aim = null, saved, listening, onStep = () => {}, onFound = () => {} }) {
  const lifting = mode === MODES.lift
  const base = aim && !lifting ? aim : targetFor(mood, lifting, state)
  const target = { ...base, ...(ask?.sound ?? {}) }
  const recent = new Set(readRecent())
  const strict = Boolean(ask && (ask.bpm || ask.sound || ask.genres?.length))
  const rank = (list, need) => (strict ? rankForAsk(list, ask, base, need) : list)

  const prefs = loadGenrePrefs()
  const library = saved.filter((s) => s.id)
  const activity = !ask?.artists?.length && !ask?.genres?.length

  onStep('find', `Looking for ${focus} songs`)
  const taste = activity ? await tasteOf(listening, library, prefs) : null
  const asked = await focusSongs({ focus, ask, taste, mood, count: NEW_MAX + 10 }).catch(() => ({ artist: '', songs: [] }))
  const want = normalize(asked.artist || ask?.artists?.[0] || '')
  const name = asked.artist || ask?.artists?.[0]
  const cap = Math.round(NEW_MAX * FOCUS_SHARE)
  let songs

  if (want) {
    const own = [...saved, ...listening].filter((s) => s.id && byArtist(s, want))
    if (!strict) onFound(unique(own).slice(0, NEW_MAX))
    onStep('find', `Pulling ${name} tracks`)
    const found = await searchArtistTracks(name).catch(() => [])
    const theirs = await rank(
      unique([...shuffle(own), ...asked.songs.filter((s) => byArtist(s, want)), ...shuffle(found)]).filter((s) => !recent.has(s.id)),
      cap
    )
    const similar = await rank(asked.songs.filter((s) => !byArtist(s, want)), NEW_MAX - cap)
    songs = unique([...theirs.slice(0, cap), ...similar]).slice(0, NEW_MAX)
    if (songs.length < NEW_MIN) songs = unique([...songs, ...theirs.slice(cap)]).slice(0, NEW_MAX)
  } else if (activity) {
    onStep('find', 'Checking your liked songs')
    const pool = unique([...library.slice(0, 200), ...listening.filter((s) => s.id)]).filter((s) => !recent.has(s.id))
    const allowed = (await applyGenrePrefs(pool, prefs).catch(() => ({ songs: pool }))).songs
    const familiar = strict ? await rank(allowed, NEW_MAX) : await closestSongs(allowed, target, NEW_MAX).catch(() => [])
    const fresh = await rank((await applyGenrePrefs(asked.songs, prefs).catch(() => ({ songs: asked.songs }))).songs, NEW_MAX)
    const half = Math.round(NEW_MAX * FAMILIAR_SHARE)
    songs = unique([...familiar.slice(0, half), ...fresh]).slice(0, NEW_MAX)
    if (songs.length < NEW_MIN) songs = unique([...songs, ...familiar.slice(half)]).slice(0, NEW_MAX)
  } else {
    songs = (await rank(unique(asked.songs), NEW_MIN)).slice(0, NEW_MAX)
  }
  onFound(songs)

  onStep('order')
  const result = await djOrder(songs, target, lifting)
  writeRecent(result)
  return result
}

const SWAP_SHARE = 0.25
const SWAP_MAX = 15
const SWAP_LIKED = 150

export async function planSwap({ songs, mood, state, lifting, library, listening, onLeaving = () => {}, onProgress = () => {} }) {
  const target = targetFor(mood, lifting, state)
  const features = await getAudioFeatures(songs.slice(0, 200).map((s) => s.id))
  const scored = songs.map((song) => ({ song, d: distance(features[song.id], target) })).filter((x) => Number.isFinite(x.d))
  const count = Math.min(SWAP_MAX, Math.max(1, Math.round(songs.length * SWAP_SHARE)))
  const leaving = [...scored].sort((a, b) => b.d - a.d).slice(0, count)
  if (!leaving.length) return null
  onLeaving(leaving.map((x) => x.song.id))
  onProgress(0.35)

  const ids = songs.map((s) => s.id)
  const have = new Set(ids)
  const prefs = loadGenrePrefs()
  const stayIn = await anchorGenres(listening, library, prefs).catch(() => [])

  const fresh = await discoverSongs({ top: listening.filter((s) => s.top), library, pool: listening, mood, state, lifting, stayIn, count: count + 5, exclude: ids }).catch(() => [])
  const freshIds = new Set(fresh.map((s) => s.id))
  onProgress(0.7)

  let pool = unique([...fresh, ...library.filter((s) => s.id && !have.has(s.id)).slice(0, SWAP_LIKED)]).filter((s) => !have.has(s.id))
  try {
    pool = (await applyGenrePrefs(pool, prefs)).songs
  } catch {
    pool = unique(pool)
  }

  const poolFeatures = await getAudioFeatures(pool.map((s) => s.id)).catch(() => ({}))
  onProgress(0.9)
  const coming = pool
    .map((song) => ({ song, d: distance(poolFeatures[song.id], target) }))
    .filter((x) => Number.isFinite(x.d))
    .sort((a, b) => a.d - b.d)

  const pairs = []
  leaving.forEach((out, i) => {
    const inn = coming[i]
    if (!inn || inn.d >= out.d) return
    pairs.push({
      id: out.song.id,
      out: { song: out.song, d: out.d },
      inn: { song: { ...inn.song, isNew: freshIds.has(inn.song.id) }, d: inn.d, tag: freshIds.has(inn.song.id) ? 'new' : 'liked' },
    })
  })
  if (!pairs.length) return null

  return { pairs, scored, target, features: { ...features, ...poolFeatures } }
}

export function swapFit(plan, chosen) {
  const swapped = new Map(plan.pairs.filter((p) => chosen.has(p.id)).map((p) => [p.id, p.inn.d]))
  const avg = (list) => (list.length ? Math.round(list.reduce((sum, d) => sum + matchPercent(d), 0) / list.length) : 0)
  return {
    before: avg(plan.scored.map((x) => x.d)),
    after: avg(plan.scored.map((x) => swapped.get(x.song.id) ?? x.d)),
  }
}

export function applySwap(songs, pairs) {
  const replace = new Map(pairs.map((p) => [p.out.song.id, p.inn.song]))
  return songs.map((s) => replace.get(s.id) ?? s)
}
