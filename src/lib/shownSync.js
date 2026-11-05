import { supabase } from './supabase'

const KEEP_DAYS = 7
const cutoff = () => new Date(Date.now() - KEEP_DAYS * 86400000).toISOString()

export async function loadShown(userId) {
  if (!supabase) return {}
  const since = cutoff()
  const { data, error } = await supabase
    .from('shown_songs')
    .select('mood, spotify_id, title, artist')
    .eq('user_id', userId)
    .gte('shown_at', since)
    .limit(5000)
  if (error) throw error
  supabase.from('shown_songs').delete().eq('user_id', userId).lt('shown_at', since).then(() => {})
  const byMood = {}
  data.forEach((r) => (byMood[r.mood] ??= []).push({ id: r.spotify_id, title: r.title ?? '', artist: r.artist ?? '' }))
  return byMood
}

export async function saveShown(userId, mood, songs) {
  if (!supabase || !songs.length) return
  const rows = songs
    .filter((s) => s.id)
    .map((s) => ({ user_id: userId, mood, spotify_id: s.id, title: s.title ?? null, artist: s.artist ?? null, shown_at: new Date().toISOString() }))
  const { error } = await supabase.from('shown_songs').upsert(rows)
  if (error) throw error
}
