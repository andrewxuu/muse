import { supabase } from '../lib/supabase'
import { searchTrack } from '../spotify/api'

const resolve = async (list) => {
  const results = await Promise.allSettled(list.map((s) => searchTrack(s.title, s.artist)))
  return results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
}

export async function llmSongs(mood, count, have = []) {
  if (!supabase) return []
  const ask = count + 8
  const avoid = have.map((s) => ({ title: s.title, artist: s.artist }))
  const { data, error } = await supabase.functions.invoke('chat', {
    body: { mode: 'songs', mood, count: ask, avoid },
  })
  if (error || !Array.isArray(data?.songs)) return []

  return resolve(data.songs)
}

export async function recommendSongs({ request, ask = null, mood, artists, avoid = [], count = 6 }) {
  if (!supabase) return []
  const { data, error } = await supabase.functions.invoke('chat', {
    body: { mode: 'recommend', request, ask, mood, artists, avoid: avoid.map((s) => ({ title: s.title, artist: s.artist })), count },
  })
  if (error || !Array.isArray(data?.songs)) return []

  return resolve(data.songs)
}

export async function focusSongs({ focus, ask = null, taste = null, mood, count = 24, avoid = [] }) {
  if (!supabase) return { artist: '', songs: [] }
  const { data, error } = await supabase.functions.invoke('chat', {
    body: { mode: 'focus', focus, ask, taste, mood, count, avoid: avoid.map((s) => ({ title: s.title, artist: s.artist })) },
  })
  if (error || !Array.isArray(data?.songs)) return { artist: '', songs: [] }
  return { artist: data.artist || '', songs: await resolve(data.songs) }
}
