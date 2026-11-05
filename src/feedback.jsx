import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAccount } from './account'
import { reportSyncError } from './lib/cloudSync'
import { markSynced, mergeFeedback, pullFeedback, pushFeedback } from './lib/feedbackSync'

const STORAGE_KEY = 'moodbot:feedback'
const MAX_LIKED = 30
const MAX_DISLIKED = 60
const FeedbackContext = createContext(null)

export const moodKey = (mood) => mood ?? 'Any'

const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
    if (saved['Some stress']) {
      const { 'Some stress': old, ...rest } = saved
      return { ...rest, Meh: rest.Meh ?? old }
    }
    return saved
  } catch {
    return {}
  }
}

const slim = (song) => ({ id: song.id, uri: song.uri, title: song.title, artist: song.artist, image: song.image })

export function FeedbackProvider({ children }) {
  const { user } = useAccount()
  const userId = user?.id ?? null
  const [feedback, setFeedback] = useState(load)
  const [pulledFor, setPulledFor] = useState(null)
  const synced = useRef(new Map())

  useEffect(() => {
    synced.current = new Map()
    if (!userId) return
    let live = true
    pullFeedback(userId)
      .then((remote) => {
        if (!live) return
        markSynced(synced.current, remote)
        setFeedback((prev) => mergeFeedback(prev, remote, { liked: MAX_LIKED, disliked: MAX_DISLIKED }))
        setPulledFor(userId)
      })
      .catch(reportSyncError)
    return () => {
      live = false
    }
  }, [userId])

  useEffect(() => {
    if (!userId || pulledFor !== userId) return
    pushFeedback(userId, feedback, synced.current).catch(reportSyncError)
  }, [feedback, userId, pulledFor])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(feedback))
    } catch {
      return
    }
  }, [feedback])

  const forMood = useCallback((mood) => feedback[moodKey(mood)] ?? { liked: [], disliked: [] }, [feedback])

  const ratingOf = useCallback(
    (mood, id) => {
      const f = forMood(mood)
      if (f.liked.some((s) => s.id === id)) return 'up'
      if (f.disliked.some((s) => s.id === id)) return 'down'
      return null
    },
    [forMood]
  )

  const rate = useCallback((mood, song, value) => {
    setFeedback((prev) => {
      const key = moodKey(mood)
      const current = prev[key] ?? { liked: [], disliked: [] }
      const liked = current.liked.filter((s) => s.id !== song.id)
      const disliked = current.disliked.filter((s) => s.id !== song.id)
      if (value === 'up') liked.unshift(slim(song))
      if (value === 'down') disliked.unshift(slim(song))
      return { ...prev, [key]: { liked: liked.slice(0, MAX_LIKED), disliked: disliked.slice(0, MAX_DISLIKED) } }
    })
  }, [])

  return <FeedbackContext.Provider value={{ forMood, ratingOf, rate }}>{children}</FeedbackContext.Provider>
}

export function useFeedback() {
  const value = useContext(FeedbackContext)
  if (!value) throw new Error('useFeedback must be used inside FeedbackProvider')
  return value
}
