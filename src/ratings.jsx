import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { setRealRatings } from './data/sampleMoods'
import { readKey, writeKey } from './lib/storageKeys'
import { useAccount } from './account'
import { reportSyncError } from './lib/cloudSync'
import { markSynced, pullRatings, pushRatings } from './lib/ratingsSync'

const STORAGE_KEY = 'moodbot:ratings'
const SCALE_KEY = 'moodbot:ratings-scale'
const MOODS = ['great', 'good', 'okay', 'low', 'awful']
const LABELS = ['Calm', 'Relaxed', 'Meh', 'Stressed', 'Very stressed']
const level = (rating) => Math.min(4, Math.max(0, Math.round(rating) - 1))
const RatingsContext = createContext(null)

export const ratingMood = (rating) => MOODS[level(rating)]
export const stressLabel = (rating) => LABELS[level(rating)]
export const stressValue = (rating) => 1 + level(rating) * 2.25

const load = () => {
  let saved
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []
  } catch {
    return []
  }
  if (readKey(SCALE_KEY) === '5') return saved
  const converted = saved.map((r) => (Number.isFinite(r.rating) ? { ...r, rating: Math.ceil(r.rating / 2) } : r))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(converted))
  } catch {
    return converted
  }
  writeKey(SCALE_KEY, '5')
  return converted
}

export function RatingsProvider({ children }) {
  const { user } = useAccount()
  const userId = user?.id ?? null
  const [ratings, setRatings] = useState(load)
  const [pulledFor, setPulledFor] = useState(null)
  const synced = useRef(new Map())
  setRealRatings(ratings)

  useEffect(() => {
    synced.current = new Map()
    if (!userId) return
    let live = true
    pullRatings(userId)
      .then((remote) => {
        if (!live) return
        markSynced(synced.current, remote)
        setRatings((prev) => {
          const have = new Set(prev.map((r) => r.id))
          return [...prev, ...remote.filter((r) => !have.has(r.id))].sort((a, b) => b.at.localeCompare(a.at))
        })
        setPulledFor(userId)
      })
      .catch(reportSyncError)
    return () => {
      live = false
    }
  }, [userId])

  useEffect(() => {
    if (!userId || pulledFor !== userId) return
    pushRatings(userId, ratings, synced.current).catch(reportSyncError)
  }, [ratings, userId, pulledFor])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings))
    } catch {
      return
    }
  }, [ratings])

  const addRating = useCallback((rating, extra = {}) => {
    const entry = { id: crypto.randomUUID(), rating, note: '', at: new Date().toISOString(), ...extra }
    setRatings((prev) => [entry, ...prev])
    return entry.id
  }, [])

  const updateRating = useCallback((id, changes) => {
    setRatings((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)))
  }, [])

  const removeRating = useCallback((id) => {
    setRatings((prev) => prev.filter((r) => r.id !== id))
  }, [])

  return <RatingsContext.Provider value={{ ratings, addRating, updateRating, removeRating }}>{children}</RatingsContext.Provider>
}

export function useRatings() {
  const value = useContext(RatingsContext)
  if (!value) throw new Error('useRatings must be used inside RatingsProvider')
  return value
}
