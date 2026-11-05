import { getArtistTags, isLastfmConfigured } from '../services/lastfm'
import { firstArtist, normalize, wordPattern } from './filters'

const GENRE_WORDS = {
  Pop: ['pop'],
  'Hip hop': ['hip hop', 'hip-hop', 'rap', 'trap', 'drill'],
  'R&B': ['r&b', 'rnb', 'rhythm and blues'],
  Rock: ['rock'],
  Indie: ['indie'],
  Alternative: ['alternative', 'alt'],
  Electronic: ['electronic', 'electronica', 'house', 'techno', 'synth'],
  EDM: ['edm', 'dubstep', 'big room'],
  'Lo-fi': ['lo-fi', 'lofi', 'lo fi'],
  Jazz: ['jazz'],
  Classical: ['classical', 'orchestral', 'baroque'],
  Folk: ['folk'],
  Country: ['country'],
  Metal: ['metal', 'metalcore'],
  'K-pop': ['k-pop', 'kpop'],
  Latin: ['latin', 'reggaeton', 'salsa', 'bachata'],
  Soul: ['soul', 'motown'],
  Ambient: ['ambient', 'drone'],
}

export const GENRE_TAGS = { 'Hip hop': 'hip-hop', 'R&B': 'rnb', 'K-pop': 'k-pop' }
export const genreTag = (genre) => GENRE_TAGS[genre] ?? genre.toLowerCase()

const PATTERNS = Object.fromEntries(Object.entries(GENRE_WORDS).map(([g, words]) => [g, words.map(wordPattern)]))

export function matchGenre(names = [], genres = []) {
  const lower = names.map((n) => n.toLowerCase())
  return genres.find((g) => PATTERNS[g]?.some((p) => lower.some((n) => p.test(n)))) ?? null
}

export function broadGenres(names = []) {
  const found = Object.keys(PATTERNS).filter((g) => matchGenre(names, [g]))
  return found.length ? found : names.slice(0, 1)
}

export function topGenres(songs, n = 2) {
  const counts = {}
  songs.forEach((s) => broadGenres(s.genres).forEach((g) => (counts[g] = (counts[g] ?? 0) + 1)))
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([g]) => g)
}

export const inGenres = (song, allowed) => broadGenres(song.genres).some((g) => allowed.includes(g))

const CACHE = 'moodbot:artist-genres'
export const MAX_LOOKUPS = 80

export const readGenreCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE)) ?? {}
  } catch {
    return {}
  }
}

export const saveGenreCache = (cache) => {
  try {
    localStorage.setItem(CACHE, JSON.stringify(cache))
  } catch {
    return
  }
}

export const artistKey = (song) => normalize(firstArtist(song.artist))

export async function lookupGenres(wanted) {
  const found = {}
  if (!isLastfmConfigured()) return found
  const tags = await Promise.allSettled(wanted.map((w) => getArtistTags(w.name)))
  tags.forEach((r, i) => {
    if (r.status === 'fulfilled') found[wanted[i].key] = r.value.filter((t) => t.count >= 20).slice(0, 8).map((t) => t.name)
  })
  return found
}

export async function fillGenres(songs, max = MAX_LOOKUPS) {
  const cache = readGenreCache()
  const seen = new Set()
  const wanted = songs
    .flatMap((song) => {
      const key = artistKey(song)
      if (song.genres?.length || !key || cache[key] || seen.has(key)) return []
      seen.add(key)
      return [{ key, id: song.artistIds?.[0], name: firstArtist(song.artist) }]
    })
    .slice(0, max)
  if (wanted.length) {
    const found = await lookupGenres(wanted).catch(() => ({}))
    if (Object.keys(found).length) {
      Object.assign(cache, found)
      saveGenreCache(cache)
    }
  }
  return songs.map((song) => (song.genres?.length ? song : { ...song, genres: cache[artistKey(song)] ?? [] }))
}

export const hasGenrePrefs = (prefs) => prefs.liked.length > 0 || prefs.avoided.length > 0

export async function applyGenrePrefs(songs, prefs) {
  if (!hasGenrePrefs(prefs)) return { songs, liked: new Set() }
  const liked = new Set()
  const kept = (await fillGenres(songs)).filter((song) => {
    if (matchGenre(song.genres, prefs.avoided)) return false
    if (matchGenre(song.genres, prefs.liked)) liked.add(song.id)
    return true
  })
  return { songs: kept, liked }
}

export const boostLiked = (list, isLiked, lift = 4) =>
  list
    .map((x, i) => [x, i - (isLiked(x) ? lift : 0)])
    .sort((a, b) => a[1] - b[1])
    .map(([x]) => x)

export async function checkGenres(songs, prefs) {
  if (!hasGenrePrefs(prefs)) return songs.map(() => ({ avoided: false, liked: null }))
  const filled = await fillGenres(songs)
  return filled.map((s) => ({ avoided: Boolean(matchGenre(s.genres, prefs.avoided)), liked: matchGenre(s.genres, prefs.liked) }))
}
