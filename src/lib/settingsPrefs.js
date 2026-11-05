import { useState } from 'react'
import { cloudPush } from './cloudSync'

export const SETTINGS_KEY = 'moodbot:settings'
const defaults = { reminder: true, suggestions: true, listening: true, chatHistory: false }

export const loadSettings = () => {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }
  } catch {
    return defaults
  }
}

export function useSettings() {
  const [prefs, setPrefs] = useState(loadSettings)

  const setPref = (key) => (value) => {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    } catch {
      return
    }
    cloudPush('settings', next)
  }

  return { prefs, setPref }
}
