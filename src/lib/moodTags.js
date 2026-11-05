import { getArtistTags, getTrackTags } from '../services/lastfm'
import { escapeRegExp, firstArtist, wordPattern } from './filters'
import { getBaseline, personalize } from './baseline'

export const MODES = { match: 'Match my mood', lift: 'Ease my stress' }

export const STATES = {
  Calm: {
    words: ['calm', 'chill', 'peace', 'mellow', 'wind down', 'slow'],
    genres: ['ambient', 'acoustic', 'chill', 'folk', 'lo-fi', 'piano', 'jazz', 'bedroom', 'new age'],
    tags: ['chill', 'mellow', 'relaxing', 'peaceful', 'calm', 'soft', 'dreamy', 'ambient', 'acoustic', 'lo-fi'],
    target: { energy: 0.35, valence: 0.6, danceability: 0.45, acousticness: 0.55 },
    opposite: 'Stressed',
    lift: 'Calm',
    feel: 'gentle',
    mix: 'Calm',
    ask: 'calm',
  },
  Relaxed: {
    words: ['relax', 'good', 'great', 'happy', 'fine', 'okay', 'easy', 'content', 'fun', 'joy', 'hype', 'pump', 'excited', 'energ'],
    genres: ['soul', 'r&b', 'pop', 'indie', 'bossa nova', 'reggae', 'funk', 'soft rock'],
    tags: ['feel good', 'laid back', 'smooth', 'easy listening', 'sunshine', 'warm', 'upbeat', 'groovy', 'summer', 'good vibes'],
    target: { energy: 0.5, valence: 0.65, danceability: 0.6, acousticness: 0.4 },
    opposite: 'Very stressed',
    lift: 'Calm',
    feel: 'easy and warm',
    mix: 'Feel good',
    ask: 'easy feel-good',
  },
  Meh: {
    words: ['meh', 'some stress', 'focus', 'study', 'work', 'busy', 'homework', 'concentrate', 'deadline', 'nervous', 'restless', 'tense', 'on edge', 'long day'],
    genres: ['lo-fi', 'ambient', 'classical', 'instrumental', 'piano', 'post-rock', 'soundtrack'],
    tags: ['instrumental', 'study', 'focus', 'concentration', 'ambient', 'lo-fi', 'post-rock', 'minimal', 'piano', 'soundtrack'],
    target: { energy: 0.55, valence: 0.45, danceability: 0.5, acousticness: 0.35 },
    opposite: 'Stressed',
    lift: 'Relaxed',
    feel: 'steady and focused',
    mix: 'Focus',
    ask: 'steady, focused',
  },
  Stressed: {
    words: ['stress', 'pressure', 'angry', 'frustrat', 'annoyed', 'swamped', 'anxious', 'worried'],
    genres: ['rock', 'metal', 'hip hop', 'rap', 'punk', 'edm', 'trap', 'drill'],
    tags: ['energetic', 'intense', 'workout', 'aggressive', 'rock', 'driving', 'hype', 'upbeat', 'banger', 'cathartic'],
    target: { energy: 0.7, valence: 0.35, danceability: 0.5, acousticness: 0.2 },
    opposite: 'Calm',
    lift: 'Meh',
    feel: 'driving, to let it out',
    mix: 'Release',
    ask: 'driving, cathartic',
  },
  'Very stressed': {
    words: ['very stress', 'overwhelm', 'panic', 'burn', 'exhaust', 'drain', 'tired', 'cry', 'sad', 'lonely', 'down', 'too much', 'rough', 'upset', 'heartbroken'],
    genres: ['emo', 'sad', 'singer-songwriter', 'slowcore', 'folk', 'indie', 'acoustic', 'piano'],
    tags: ['sad', 'melancholy', 'melancholic', 'emotional', 'lonely', 'heartbreak', 'bittersweet', 'crying', 'cathartic', 'comforting'],
    target: { energy: 0.4, valence: 0.25, danceability: 0.35, acousticness: 0.5 },
    opposite: 'Relaxed',
    lift: 'Meh',
    feel: 'honest and comforting',
    mix: 'Comfort',
    ask: 'comforting, tender',
  },
}

export const MOODS = STATES
export const MOOD_NAMES = Object.keys(STATES)
export const MOOD_TAGS = Object.fromEntries(Object.entries(STATES).map(([name, s]) => [name, s.tags]))
export const DIMS = ['energy', 'valence', 'danceability', 'acousticness', 'instrumentalness']
export const targets = Object.fromEntries(Object.entries(STATES).map(([name, s]) => [name, s.target]))

const LEGACY = { Hype: 'Stressed', Sad: 'Very stressed', Focus: 'Meh', 'Some stress': 'Meh', Happy: 'Relaxed' }
export const canonMood = (mood) => (mood in STATES ? mood : (LEGACY[mood] ?? null))
export const stateOf = (mood) => STATES[canonMood(mood)]

const personal = (name) => {
  const baseline = getBaseline()
  return baseline ? personalize(STATES[name].target, STATES.Meh.target, baseline) : STATES[name].target
}

export const targetOf = (mood) => {
  const key = canonMood(mood)
  return key ? personal(key) : undefined
}
export const mixName = (mood) => `${stateOf(mood)?.mix ?? 'Mood'} mix`

const CENTERS = [1.5, 3.5, 5.5, 7.5, 9.5]
const EASE = 0.65
const OPPOSITE_WEIGHT = 0.5
const ARTIST_WEIGHT = 0.5
const MIN_TRACK_TAGS = 3

const PATTERNS = Object.fromEntries(Object.entries(STATES).map(([name, s]) => [name, s.tags.map(wordPattern)]))
const PREFIXES = Object.entries(STATES).map(([name, s]) => [
  name,
  [...s.words, name.toLowerCase()].map((w) => [w.length, new RegExp(`\\b${escapeRegExp(w)}`)]),
])

export function detectMood(text) {
  const t = text.toLowerCase()
  let best = null
  let bestLength = 0
  for (const [name, patterns] of PREFIXES) {
    for (const [length, pattern] of patterns) {
      if (length > bestLength && pattern.test(t)) [best, bestLength] = [name, length]
    }
  }
  return best
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function lerp(a, b, t) {
  const out = {}
  Object.keys(a).forEach((k) => (out[k] = a[k] + (b[k] - a[k]) * t))
  return out
}

const nudge = (target, changes) =>
  Object.fromEntries(Object.entries(target).map(([k, v]) => [k, clamp(v + (changes[k] ?? 0), 0, 1)]))

function trendOf(recent) {
  if (recent.length < 2) return null
  const before = recent.slice(0, -1)
  const delta = recent.at(-1) - before.reduce((a, b) => a + b, 0) / before.length
  return delta >= 1.5 ? 'rising' : delta <= -1.5 ? 'easing' : null
}

export function stateFor({ stress, hour = new Date().getHours(), recent = [] }) {
  const s = clamp(stress, 1, 10)
  const mood = MOOD_NAMES[Math.min(4, Math.floor((s - 1) / 2))]
  const low = clamp(Math.floor((s - CENTERS[0]) / 2), 0, 3)
  const t = clamp((s - CENTERS[low]) / 2, 0, 1)
  const blended = lerp(personal(MOOD_NAMES[low]), personal(MOOD_NAMES[low + 1]), t)
  const eased = lerp(blended, personal(STATES[mood].lift), EASE)

  const night = hour >= 22 || hour < 5
  const trend = trendOf(recent)
  const changes = {
    energy: (night ? -0.1 : 0) + (trend === 'rising' ? -0.05 : 0),
    acousticness: night ? 0.08 : 0,
    valence: trend === 'easing' ? 0.05 : 0,
  }

  return {
    mood,
    stress: s,
    label: trend ? `${mood}, ${trend}` : mood,
    detail: night ? 'Late night' : '',
    trend,
    night,
    mix: STATES[mood].mix,
    target: nudge(blended, changes),
    eased: nudge(eased, changes),
  }
}

export function targetFor(mood, lifting, state) {
  const key = canonMood(mood)
  if (!key) return {}
  if (state?.mood === key) return lifting ? state.eased : state.target
  const base = personal(key)
  return lifting ? lerp(base, personal(STATES[key].lift), EASE) : { ...base }
}

export function nearestMood(target) {
  if (!target || !Object.keys(target).length) return null
  let best = null
  let bestGap = Infinity
  for (const name of MOOD_NAMES) {
    const gap = distance(personal(name), target)
    if (gap < bestGap) [best, bestGap] = [name, gap]
  }
  return best
}

export const effectiveMood = (mood, lifting) => {
  const key = canonMood(mood)
  return key && lifting ? STATES[key].lift : key
}

export const discoveryTags = (mood) => stateOf(mood).tags.slice(0, 5)

export function distance(features, target) {
  const keys = Object.keys(target).filter((k) => DIMS.includes(k) && typeof features?.[k] === 'number')
  if (!keys.length) return Infinity
  return Math.sqrt(keys.reduce((sum, k) => sum + (features[k] - target[k]) ** 2, 0) / keys.length)
}

export function averageOf(list) {
  const out = {}
  DIMS.forEach((k) => {
    const values = list.map((f) => f?.[k]).filter((v) => typeof v === 'number')
    if (values.length) out[k] = values.reduce((a, b) => a + b, 0) / values.length
  })
  return out
}

export function blend(target, taste, amount) {
  const out = { ...target }
  Object.keys(target).forEach((k) => {
    if (typeof taste[k] === 'number') out[k] = target[k] * (1 - amount) + taste[k] * amount
  })
  return out
}

function matchTags(tags, mood) {
  const hits = []
  let total = 0
  tags.forEach((t) => {
    if (!PATTERNS[mood].some((p) => p.test(t.name))) return
    total += t.count / 100
    if (!hits.includes(t.name)) hits.push(t.name)
  })
  return { total, hits }
}

export function scoreTags(tags, mood) {
  const key = canonMood(mood)
  const good = matchTags(tags, key)
  const bad = matchTags(tags, STATES[key].opposite)
  return { score: good.total - OPPOSITE_WEIGHT * bad.total, matched: good.hits.slice(0, 3) }
}

async function tagsFor({ artist, title }) {
  const name = firstArtist(artist)
  const track = await getTrackTags(name, title).catch(() => [])
  if (track.filter((t) => t.count >= 10).length >= MIN_TRACK_TAGS) return track
  const fromArtist = await getArtistTags(name).catch(() => [])
  return [...track, ...fromArtist.map((t) => ({ ...t, count: t.count * ARTIST_WEIGHT }))]
}

export async function scoreSongs(songs, mood) {
  const tags = await Promise.all(songs.map(tagsFor))
  return tags.map((t) => scoreTags(t, mood))
}
