import { supabase } from './supabase'
import { DONE_KEY } from './storageKeys'

const FIELDS = {
  genres: { key: 'moodbot:genres', empty: { liked: [], avoided: [] } },
  saved: { key: 'moodbot:saved-songs', empty: [] },
  appearance: { key: 'moodbot:appearance', empty: { accent: 'ocean', stress: 'default' } },
  settings: { key: 'moodbot:settings', empty: null },
  onboarded: { key: DONE_KEY, empty: false, toCloud: (raw) => raw === '1', fromCloud: (value) => (value ? '1' : null) },
}
const BASE_FIELDS = ['genres', 'saved']
const timers = {}
const listeners = new Set()
let userId = null

const missingColumn = (error) => ['PGRST204', '42703'].includes(error?.code)

const readLocal = (field) => {
  const { key, empty, toCloud } = FIELDS[field]
  try {
    const raw = localStorage.getItem(key)
    if (toCloud) return toCloud(raw)
    return JSON.parse(raw) ?? empty
  } catch {
    return empty
  }
}

const writeLocal = (field, value) => {
  const { key, fromCloud } = FIELDS[field]
  try {
    const stored = fromCloud ? fromCloud(value) : JSON.stringify(value)
    if (stored == null) localStorage.removeItem(key)
    else localStorage.setItem(key, stored)
  } catch {
    return
  }
}

export const setSyncUser = (id) => {
  userId = id
}

export const getSyncUser = () => userId

export const onSyncError = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const report = (error) => {
  console.warn('[moodbot] cloud sync failed', error?.message ?? error)
  listeners.forEach((listener) => listener(error))
}

export const reportSyncError = (error) => {
  if (!['42P01', 'PGRST205'].includes(error?.code)) report(error)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function pushAll(id) {
  if (!supabase) return
  const row = { user_id: id, updated_at: new Date().toISOString() }
  for (const field of Object.keys(FIELDS)) row[field] = readLocal(field)
  let { error } = await supabase.from('user_data').upsert(row)
  if (missingColumn(error)) {
    const base = { user_id: id, updated_at: row.updated_at }
    BASE_FIELDS.forEach((field) => (base[field] = row[field]))
    ;({ error } = await supabase.from('user_data').upsert(base))
  }
  if (error) throw error
}

export async function pullCloud(id) {
  if (!supabase) return
  const select = (fields) => supabase.from('user_data').select(fields.join(', ')).eq('user_id', id).maybeSingle()
  let { data, error } = await select(Object.keys(FIELDS))
  if (missingColumn(error)) ({ data, error } = await select(BASE_FIELDS))
  if (error) throw error
  if (!data) return pushAll(id)
  for (const field of Object.keys(FIELDS)) {
    const value = data[field]
    if (value == null || (field === 'onboarded' && !value)) continue
    writeLocal(field, value)
  }
}

const save = async (field, value) => {
  const { error } = await supabase.from('user_data').upsert({ user_id: userId, [field]: value, updated_at: new Date().toISOString() })
  return error
}

export function cloudPush(field, value) {
  if (!supabase || !userId) return
  clearTimeout(timers[field])
  timers[field] = setTimeout(async () => {
    let error = await save(field, value)
    if (error && !missingColumn(error)) {
      await wait(2000)
      error = await save(field, value)
    }
    if (error && !missingColumn(error)) report(error)
  }, 600)
}
