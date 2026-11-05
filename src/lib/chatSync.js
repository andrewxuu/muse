import { supabase } from './supabase'
import { getSyncUser, reportSyncError } from './cloudSync'
import { loadSettings } from './settingsPrefs'

const CHATS_KEY = 'moodbot:chats'
const PULL_DAYS = 30
const timers = {}

const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(CHATS_KEY)) ?? {}
  } catch {
    return {}
  }
}

export function pushChatDay(day, messages) {
  const userId = getSyncUser()
  if (!supabase || !userId || !loadSettings().chatHistory) return
  const real = messages.filter((m) => !m.pending)
  if (real.length <= 1) return
  clearTimeout(timers[day])
  timers[day] = setTimeout(async () => {
    const { error } = await supabase
      .from('chat_days')
      .upsert({ user_id: userId, day, messages: real, updated_at: new Date().toISOString() })
    if (error) reportSyncError(error)
  }, 1500)
}

export async function pullChats(userId) {
  if (!supabase || !loadSettings().chatHistory) return false
  const { data, error } = await supabase
    .from('chat_days')
    .select('day, messages')
    .eq('user_id', userId)
    .order('day', { ascending: false })
    .limit(PULL_DAYS)
  if (error) throw error
  const local = readLocal()
  let changed = false
  data.forEach(({ day, messages }) => {
    if (local[day]?.length > 1 || !Array.isArray(messages)) return
    local[day] = messages
    changed = true
  })
  if (changed) {
    try {
      localStorage.setItem(CHATS_KEY, JSON.stringify(local))
    } catch {
      return false
    }
  }
  return changed
}
