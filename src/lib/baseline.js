import { getAudioFeatures } from '../services/reccobeats'
import { readKey, removeKey, writeKey } from './storageKeys'

export const BASELINE_KEY = 'moodbot:baseline'
export const FEATURES = ['energy', 'valence', 'danceability', 'acousticness', 'instrumentalness', 'tempo']

const MEDIUM_SHARE = 0.7
const RANK_DECAY = 0.05
const PRIOR_TRACKS = 20
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const SCALE_MIN = 0.6
const SCALE_MAX = 1.5

const DEFAULT_CENTER = { energy: 0.55, valence: 0.45, danceability: 0.5, acousticness: 0.35, instrumentalness: 0.05, tempo: 118 }
const DEFAULT_SPREAD = { energy: 0.25, valence: 0.25, danceability: 0.2, acousticness: 0.3, instrumentalness: 0.1, tempo: 30 }
const MIN_SPREAD = { energy: 0.08, valence: 0.08, danceability: 0.08, acousticness: 0.08, instrumentalness: 0.05, tempo: 10 }

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const rankWeight = (rank) => 1 / (1 + rank * RANK_DECAY)

export function weightedQuantile(samples, q) {
  if (!samples.length) return null
  const sorted = [...samples].sort((a, b) => a.value - b.value)
  const total = sorted.reduce((sum, s) => sum + s.weight, 0)
  let seen = 0
  for (const s of sorted) {
    seen += s.weight
    if (seen >= q * total) return s.value
  }
  return sorted.at(-1).value
}

function weightTracks(medium, short) {
  const weights = new Map()
  const add = (list, share) =>
    list.forEach((song, rank) => {
      if (song?.id) weights.set(song.id, (weights.get(song.id) ?? 0) + share * rankWeight(rank))
    })
  add(medium, short.length ? MEDIUM_SHARE : 1)
  add(short, 1 - MEDIUM_SHARE)
  return weights
}

export function summarize(weights, features) {
  const ids = [...weights.keys()].filter((id) => features[id])
  const trust = ids.length / (ids.length + PRIOR_TRACKS)
  const center = {}
  const spread = {}
  const low = {}
  const high = {}
  const mix = (mine, base) => (mine === null ? base : trust * mine + (1 - trust) * base)

  FEATURES.forEach((f) => {
    const samples = ids
      .filter((id) => typeof features[id][f] === 'number')
      .map((id) => ({ value: features[id][f], weight: weights.get(id) }))
    const mid = weightedQuantile(samples, 0.5)
    const lo = weightedQuantile(samples, 0.1)
    const hi = weightedQuantile(samples, 0.9)

    center[f] = mix(mid, DEFAULT_CENTER[f])
    spread[f] = Math.max(mix(mid === null ? null : (hi - lo) / 2, DEFAULT_SPREAD[f]), MIN_SPREAD[f])
    low[f] = center[f] - spread[f]
    high[f] = center[f] + spread[f]
  })

  return { center, spread, low, high, count: ids.length, updatedAt: Date.now() }
}

export async function computeBaseline({ medium = [], short = [] }) {
  const weights = weightTracks(medium, short)
  if (!weights.size) return null
  const features = await getAudioFeatures([...weights.keys()]).catch(() => null)
  if (!features) return null
  const baseline = summarize(weights, features)
  return baseline.count ? baseline : null
}

export function personalize(target, meh, baseline) {
  const out = {}
  Object.keys(target).forEach((k) => {
    if (typeof baseline.center[k] !== 'number' || typeof meh[k] !== 'number') return void (out[k] = target[k])
    const scale = clamp(baseline.spread[k] / DEFAULT_SPREAD[k], SCALE_MIN, SCALE_MAX)
    out[k] = clamp(baseline.center[k] + (target[k] - meh[k]) * scale, baseline.low[k], baseline.high[k])
  })
  return out
}

function loadBaseline() {
  try {
    const saved = JSON.parse(readKey(BASELINE_KEY))
    return saved?.center && saved?.spread ? saved : null
  } catch {
    return null
  }
}

let active = loadBaseline()

export const getBaseline = () => active

export function setBaseline(baseline) {
  active = baseline ?? null
  if (active) writeKey(BASELINE_KEY, JSON.stringify(active))
  else removeKey(BASELINE_KEY)
}

export const isFresh = (baseline) => Boolean(baseline) && Date.now() - baseline.updatedAt < MAX_AGE_MS

export async function refreshBaseline(lists) {
  if (isFresh(active)) return active
  const fresh = await computeBaseline(lists)
  if (fresh) setBaseline(fresh)
  return fresh ?? active
}
