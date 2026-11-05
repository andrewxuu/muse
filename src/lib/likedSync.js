import { supabase } from './supabase'
import { getLikedPage, getLikedSongs } from '../spotify/api'
import { reportSyncError } from './cloudSync'

const PAGE = 50
const READ = 1000

const must = ({ data, error, count }) => {
  if (error) {
    error.fromDb = true
    throw error
  }
  return { data, count }
}

const toRow = (userId, s) => ({
  user_id: userId,
  spotify_id: s.id,
  uri: s.uri ?? null,
  title: s.title ?? null,
  artist: s.artist ?? null,
  artist_ids: s.artistIds ?? [],
  album: s.album ?? null,
  image: s.image ?? null,
  duration_ms: s.durationMs ?? null,
  added_at: s.addedAt ?? new Date().toISOString(),
})

const fromRow = (r) => ({
  id: r.spotify_id,
  uri: r.uri,
  title: r.title,
  artist: r.artist,
  artistIds: r.artist_ids ?? [],
  album: r.album ?? '',
  image: r.image,
  durationMs: r.duration_ms ?? 0,
  source: 'spotify',
  addedAt: r.added_at,
})

async function readIds(userId) {
  const ids = new Set()
  for (let from = 0; ; from += READ) {
    const { data } = must(await supabase.from('liked_songs').select('spotify_id').eq('user_id', userId).range(from, from + READ - 1))
    data.forEach((r) => ids.add(r.spotify_id))
    if (data.length < READ) return ids
  }
}

async function readAll(userId) {
  const rows = []
  for (let from = 0; ; from += READ) {
    const { data } = must(
      await supabase
        .from('liked_songs')
        .select('spotify_id, uri, title, artist, artist_ids, album, image, duration_ms, added_at')
        .eq('user_id', userId)
        .order('added_at', { ascending: false, nullsFirst: false })
        .range(from, from + READ - 1)
    )
    rows.push(...data)
    if (data.length < READ) return rows.map(fromRow)
  }
}

async function save(userId, songs) {
  for (let i = 0; i < songs.length; i += 500) {
    must(await supabase.from('liked_songs').upsert(songs.slice(i, i + 500).map((s) => toRow(userId, s))))
  }
}

async function sync(userId, max, onProgress) {
  const known = await readIds(userId)
  const first = await getLikedPage(0)
  const limit = Math.min(first.total, max)
  let have = known.size
  const fresh = []
  const take = (songs) => {
    const unknown = songs.filter((s) => !known.has(s.id))
    unknown.forEach((s) => known.add(s.id))
    fresh.push(...unknown)
    have += unknown.length
    onProgress?.(Math.min(have, limit), limit)
    return unknown.length
  }

  let offset = 0
  let page = first
  while (true) {
    const added = take(page.songs)
    offset += PAGE
    if (!added || offset >= limit) break
    page = await getLikedPage(offset)
  }

  offset = Math.floor(have / PAGE) * PAGE
  while (have < limit && offset < limit) {
    page = await getLikedPage(offset)
    take(page.songs)
    offset += PAGE
  }

  if (fresh.length) await save(userId, fresh)
  must(await supabase.from('user_data').upsert({ user_id: userId, liked_synced_at: new Date().toISOString() }))
  return { songs: await readAll(userId), full: have >= limit }
}

export async function loadLikedSongs(userId, max, onProgress) {
  const fallback = async () => {
    const songs = await getLikedSongs(max)
    return { songs, full: songs.length < max }
  }
  if (!supabase || !userId) return fallback()
  try {
    return await sync(userId, max, onProgress)
  } catch (err) {
    if (!err.fromDb) throw err
    reportSyncError(err)
    return fallback()
  }
}

export async function saveLikedSong(userId, song) {
  if (!supabase || !userId) return
  try {
    await save(userId, [{ ...song, addedAt: new Date().toISOString() }])
  } catch (err) {
    reportSyncError(err)
  }
}

export async function removeLikedSong(userId, id) {
  if (!supabase || !userId) return
  const { error } = await supabase.from('liked_songs').delete().eq('user_id', userId).eq('spotify_id', id)
  if (error) reportSyncError(error)
}
