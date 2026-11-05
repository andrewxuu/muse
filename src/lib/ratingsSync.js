import { supabase } from './supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const stamp = (r) => `${r.rating}|${r.note ?? ''}|${r.at}`

export async function pullRatings(userId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('mood_checkins')
    .select('id, rating, note, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) throw error
  return data.map((row) => ({ id: row.id, rating: row.rating, note: row.note ?? '', at: row.created_at }))
}

export const markSynced = (synced, ratings) => ratings.forEach((r) => synced.set(r.id, stamp(r)))

export async function pushRatings(userId, ratings, synced) {
  if (!supabase) return
  const valid = ratings.filter((r) => UUID.test(r.id ?? '') && Number.isFinite(r.rating))
  const changed = valid.filter((r) => synced.get(r.id) !== stamp(r))
  const present = new Set(valid.map((r) => r.id))
  const removed = [...synced.keys()].filter((id) => !present.has(id))

  if (changed.length) {
    const rows = changed.map((r) => ({ id: r.id, user_id: userId, rating: r.rating, note: r.note ?? '', created_at: r.at }))
    const { error } = await supabase.from('mood_checkins').upsert(rows)
    if (error) throw error
    markSynced(synced, changed)
  }
  if (removed.length) {
    const { error } = await supabase.from('mood_checkins').delete().eq('user_id', userId).in('id', removed)
    if (error) throw error
    removed.forEach((id) => synced.delete(id))
  }
}
