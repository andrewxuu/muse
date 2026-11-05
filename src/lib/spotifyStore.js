import { supabase } from './supabase'

const LOCAL = 'moodbot:spotify:'
const MISS_MS = 7 * 24 * 60 * 60 * 1000

async function currentUser(userId) {
  if (userId !== undefined) return userId
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? null
}

const readLocal = (key) => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL + key))
  } catch {
    return null
  }
}

const writeLocal = (key, value) => {
  try {
    localStorage.setItem(LOCAL + key, JSON.stringify(value))
  } catch {
    return
  }
}

const localKeys = () => {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(LOCAL))
  } catch {
    return []
  }
}

const removeLocal = (fullKey) => {
  try {
    localStorage.removeItem(fullKey)
  } catch {
    return
  }
}

export async function loadSaved(key, userId) {
  const id = await currentUser(userId)
  if (!id || !supabase) return readLocal(key)
  const { data, error } = await supabase.from('spotify_cache').select('data').eq('user_id', id).eq('key', key).maybeSingle()
  return error ? null : (data?.data ?? null)
}

export async function saveData(key, value, userId) {
  const id = await currentUser(userId)
  if (!id || !supabase) return writeLocal(key, value)
  const { error } = await supabase.from('spotify_cache').upsert({ user_id: id, key, data: value, fetched_at: new Date().toISOString() })
  if (error) console.warn('[moodbot] Spotify save failed', error.message)
}

export async function forgetSaved(key, userId) {
  removeLocal(LOCAL + key)
  const id = await currentUser(userId)
  if (id && supabase) await supabase.from('spotify_cache').delete().eq('user_id', id).eq('key', key)
}

export async function forgetAllSaved(userId) {
  localKeys().forEach(removeLocal)
  const id = await currentUser(userId)
  if (id && supabase) await supabase.from('spotify_cache').delete().eq('user_id', id)
}

export async function lookupTrack(key) {
  if (!supabase) return undefined
  const { data, error } = await supabase.from('track_lookup').select('song, updated_at').eq('key', key).maybeSingle()
  if (error || !data) return undefined
  if (!data.song && Date.now() - Date.parse(data.updated_at) > MISS_MS) return undefined
  return data.song
}

export async function saveTrack(key, song) {
  if (!supabase || !(await currentUser())) return
  await supabase.from('track_lookup').upsert({ key, song, updated_at: new Date().toISOString() })
}
