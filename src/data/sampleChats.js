import { dayKey, seeded } from './sampleMoods'
import { pushChatDay } from '../lib/chatSync'
import { sampleDataOn } from '../lib/devMode'

const STORAGE_KEY = 'moodbot:chats'
const DAYS_BACK = 14

export const greetingText = "Hi! How are you feeling? Tell me and I'll find music for it."

const prompts = {
  Calm: ['Long day, I need to wind down', 'Want something calm before bed', 'Just want to chill for a bit'],
  Relaxed: ['Feeling good today, keep it going', 'Pretty relaxed, give me something easy', 'Just got good news'],
  Meh: ['Studying for midterms, need focus music', 'Got a lot of work to get through', 'Help me focus on this essay'],
  Stressed: ['Stressed about exams, need to let it out', 'Deadline tomorrow and I am wound up', 'Need something intense to get through today'],
  'Very stressed': ['Feeling overwhelmed today', 'Rough day, I need something comforting', 'Missing home a bit'],
}
const moods = Object.keys(prompts)

export const todayKey = () => dayKey(new Date())

export function loadChats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
  } catch {
    return {}
  }
}

export function saveChat(key, messages) {
  try {
    const all = loadChats()
    all[key] = messages
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    return
  }
  pushChatDay(key, messages)
}

const pickFrom = (rand, list) => list[Math.floor(rand() * list.length)]

function sampleChat(date, pool, reason) {
  const rand = seeded(`chat-${dayKey(date)}`)
  if (rand() < 0.3) return null
  const messages = [{ id: 0, from: 'bot', text: greetingText }]
  const turns = rand() < 0.35 ? 2 : 1
  let id = 1
  for (let t = 0; t < turns; t++) {
    const mood = pickFrom(rand, moods)
    const songs = [...pool].sort(() => rand() - 0.5).slice(0, 3)
    messages.push({ id: id++, from: 'user', text: pickFrom(rand, prompts[mood]) })
    messages.push({ id: id++, from: 'bot', mood, songs, reason })
  }
  return messages
}

export function chatDays(pool, reason) {
  const saved = loadChats()
  const now = new Date()
  const days = []
  for (let back = 0; back <= DAYS_BACK; back++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
    const key = dayKey(date)
    const messages = saved[key] ?? (back === 0 || !sampleDataOn() ? null : sampleChat(date, pool, reason))
    if (back === 0 || messages) days.push({ key, date, messages })
  }
  return days
}

export function dayName(date) {
  const now = new Date()
  const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - date) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
