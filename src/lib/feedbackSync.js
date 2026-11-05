import { supabase } from './supabase'

const stamp = (row) => `${row.vote}|${row.title ?? ''}|${row.artist ?? ''}`
const keyOf = (row) => `${row.mood}|${row.id}`

const flatten = (feedback) =>
  Object.entries(feedback).flatMap(([mood, lists]) => [
    ...(lists?.liked ?? []).map((s) => ({ ...s, mood, vote: 'up' })),
    ...(lists?.disliked ?? []).map((s) => ({ ...s, mood, vote: 'down' })),
  ])

export async function pullFeedback(userId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('song_feedback')
    .select('mood, spotify_id, vote, uri, title, artist, image')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) throw error
  return data.map((r) => ({ mood: r.mood, id: r.spotify_id, vote: r.vote, uri: r.uri, title: r.title, artist: r.artist, image: r.image }))
}

export const markSynced = (synced, rows) => rows.forEach((row) => synced.set(keyOf(row), stamp(row)))

export function mergeFeedback(prev, remote, caps) {
  const out = Object.fromEntries(Object.entries(prev).map(([mood, l]) => [mood, { liked: [...(l?.liked ?? [])], disliked: [...(l?.disliked ?? [])] }]))
  remote.forEach(({ mood, vote, ...song }) => {
    const bucket = (out[mood] ??= { liked: [], disliked: [] })
    if (bucket.liked.some((s) => s.id === song.id) || bucket.disliked.some((s) => s.id === song.id)) return
    bucket[vote === 'up' ? 'liked' : 'disliked'].push(song)
  })
  Object.values(out).forEach((b) => {
    b.liked = b.liked.slice(0, caps.liked)
    b.disliked = b.disliked.slice(0, caps.disliked)
  })
  return out
}

export async function pushFeedback(userId, feedback, synced) {
  if (!supabase) return
  const rows = flatten(feedback).filter((r) => r.id)
  const changed = rows.filter((r) => synced.get(keyOf(r)) !== stamp(r))
  const present = new Set(rows.map(keyOf))
  const removed = [...synced.keys()].filter((k) => !present.has(k))

  if (changed.length) {
    const payload = changed.map((r) => ({
      user_id: userId,
      mood: r.mood,
      spotify_id: r.id,
      vote: r.vote,
      uri: r.uri ?? null,
      title: r.title ?? null,
      artist: r.artist ?? null,
      image: r.image ?? null,
    }))
    const { error } = await supabase.from('song_feedback').upsert(payload)
    if (error) throw error
    markSynced(synced, changed)
  }

  const byMood = {}
  removed.forEach((k) => {
    const [mood, ...rest] = k.split('|')
    ;(byMood[mood] ??= []).push(rest.join('|'))
  })
  for (const [mood, ids] of Object.entries(byMood)) {
    const { error } = await supabase.from('song_feedback').delete().eq('user_id', userId).eq('mood', mood).in('spotify_id', ids)
    if (error) throw error
    ids.forEach((id) => synced.delete(`${mood}|${id}`))
  }
}
