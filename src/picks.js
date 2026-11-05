import { getAudioFeatures } from './services/reccobeats'
import { searchTrack } from './spotify/api'
import { getArtistTopTracks, getSimilarArtists, getSimilarTracks, getTagTopTracks, isLastfmConfigured } from './services/lastfm'
import { FILTERS, firstArtist, joinWords, libraryProfile, passesLanguage, shuffle, songKey, uniqueBy } from './lib/filters'
import { MODES, averageOf, blend, canonMood, discoveryTags, distance, effectiveMood, scoreSongs, stateOf, targetFor } from './lib/moodTags'
import { boostLiked, checkGenres, fillGenres, genreTag, hasGenrePrefs, inGenres, matchGenre } from './lib/genreMatch'
import { loadGenrePrefs } from './lib/genrePrefs'

export { DIMS, averageOf, detectMood, distance, targets } from './lib/moodTags'

const FEEDBACK = {
  likedSeeds: 2,
  likedWeight: 1.5,
  dislikedChecked: 4,
  dislikePenalty: 1.5,
  tasteBase: 0.15,
  tasteStep: 0.05,
  tasteMax: 0.5,
}

const TAGS = {
  sampleSize: 6,
  discoveryTags: 2,
  discoveryPages: 3,
  searched: 4,
  maxPicks: 1,
  tasteWeight: 0.3,
}

const notAvoided = (prefs) => (song) => !(song.genres?.length && matchGenre(song.genres, prefs.avoided))

const likedFirst = boostLiked

export function pickSongs(pool, mood, mode, exclude = [], prefs = loadGenrePrefs()) {
  const lifting = mode === MODES.lift && mood
  const target = effectiveMood(mood, lifting)
  const keywords = target ? stateOf(target).genres : []
  const genreOf = (song) => song.genres?.find((g) => keywords.some((k) => g.includes(k)))
  const liked = (song) => Boolean(song.genres?.length && matchGenre(song.genres, prefs.liked))

  const skip = new Set(exclude)
  const allowed = notAvoided(prefs)
  const available = pool.filter((s) => !skip.has(s.id) && allowed(s))
  const matches = likedFirst(shuffle(available.filter(genreOf)), liked)
  const rest = likedFirst(shuffle(available.filter((s) => !genreOf(s))), liked)
  const genre = matches.length ? genreOf(matches[0]) : null

  let reason = 'Picked from your recent Spotify listening.'
  if (genre && lifting) reason = `Easing your stress with ${genre}, which you play a lot.`
  else if (genre) reason = `Fits feeling ${canonMood(mood).toLowerCase()}, and you play a lot of ${genre}.`

  return { songs: [...matches, ...rest].slice(0, 3), reason }
}

const closest = (songs, features, target, n) =>
  [...songs].sort((a, b) => distance(features[a.id], target) - distance(features[b.id], target)).slice(0, n)

async function rankByTags(list, mood, n) {
  const sample = shuffle(list.slice(0, 25)).slice(0, TAGS.sampleSize)
  const scores = await scoreSongs(sample, mood)
  return sample
    .map((song, i) => ({ song, score: scores[i].score }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.song)
}

async function tagCandidates(mood, knownKeys, profile, likedGenres) {
  const moodTags = shuffle(discoveryTags(mood))
  const tags = likedGenres.length
    ? [...moodTags.slice(0, TAGS.discoveryTags - 1), genreTag(shuffle(likedGenres)[0])]
    : moodTags.slice(0, TAGS.discoveryTags)
  const randomPage = () => String(1 + Math.floor(Math.random() * TAGS.discoveryPages))
  const lists = await Promise.allSettled(tags.map((tag) => getTagTopTracks(tag, 50, randomPage())))

  const out = new Map()
  lists.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    r.value.forEach((t) => {
      if (!t.title || !t.artist) return
      const key = songKey(t.artist, t.title)
      if (out.has(key) || knownKeys.has(key) || !passesLanguage(t, profile)) return
      out.set(key, { ...t, score: 0, fromTag: tags[i] })
    })
  })
  return shuffle([...out.values()])
}

async function dislikePenalties(disliked) {
  const penalties = new Map()
  const lists = await Promise.allSettled(
    disliked.slice(0, FEEDBACK.dislikedChecked).map((s) => getSimilarTracks(firstArtist(s.artist), s.title, 30))
  )
  lists.forEach((r) => {
    if (r.status !== 'fulfilled') return
    r.value.forEach((c) => {
      const key = songKey(c.artist, c.title)
      penalties.set(key, (penalties.get(key) ?? 0) + c.match * FEEDBACK.dislikePenalty)
    })
  })
  return penalties
}

async function findCandidates(seeds, knownKeys, profile, { boosted, penalties }) {
  const candidates = new Map()
  const add = (c, weight) => {
    if (!c.title || !c.artist) return
    const key = songKey(c.artist, c.title)
    if (knownKeys.has(key) || !passesLanguage(c, profile)) return
    const current = candidates.get(key) ?? { ...c, score: 0 }
    current.score += weight
    candidates.set(key, current)
  }

  const lists = await Promise.allSettled(seeds.map((s) => getSimilarTracks(firstArtist(s.artist), s.title, 30)))
  lists.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    const weight = boosted.has(seeds[i].id) ? FEEDBACK.likedWeight : 1
    r.value.forEach((c) => add(c, c.match * weight))
  })

  if (candidates.size < 15) {
    const artists = [...new Set(seeds.map((s) => firstArtist(s.artist)))].slice(0, 3)
    const similar = await Promise.allSettled(artists.map((a) => getSimilarArtists(a, 3)))
    const related = similar.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).slice(0, 6)
    const tops = await Promise.allSettled(related.map((a) => getArtistTopTracks(a.name, 3)))
    tops.forEach((r, i) => r.status === 'fulfilled' && r.value.forEach((t) => add(t, related[i].match * 0.5)))
  }

  return [...candidates.values()]
    .map((c) => ({ ...c, score: c.score - (penalties.get(songKey(c.artist, c.title)) ?? 0) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function searchWithRetry(candidate) {
  try {
    return await searchTrack(candidate.title, candidate.artist)
  } catch (err) {
    if (err.status !== 429 || err.quota || err.cooldown) throw err
    await pause(Math.min(5, err.retryAfter ?? 2) * 1000)
    return searchTrack(candidate.title, candidate.artist)
  }
}

async function resolveOnSpotify(candidates, knownIds, skip, { stopAt = Infinity, trace = null } = {}) {
  const results = []
  let hits = 0
  for (let i = 0; i < candidates.length && hits < stopAt; i += 4) {
    const settled = await Promise.allSettled(candidates.slice(i, i + 4).map(searchWithRetry))
    hits += settled.filter((r) => r.status === 'fulfilled' && r.value).length
    results.push(...settled)
    if (settled.some((r) => r.status === 'rejected' && (r.reason?.quota || r.reason?.cooldown))) break
  }
  if (trace) {
    const failed = results.filter((r) => r.status === 'rejected')
    trace.searched = results.length
    trace.failed = failed.length
    trace.error = failed[0]?.reason?.message ?? null
  }
  const seen = new Set()
  const out = []
  results.forEach((r, i) => {
    const song = r.status === 'fulfilled' ? r.value : null
    if (!song || knownIds.has(song.id) || skip.has(song.id) || seen.has(song.id)) return
    seen.add(song.id)
    out.push({ song, score: candidates[i].score, fromTag: candidates[i].fromTag })
  })
  return out
}

async function byTags(found, mood) {
  const scores = await scoreSongs(found.map((x) => x.song), mood)
  const top = Math.max(...found.map((x) => x.score), 1)
  const fits = found
    .map((x, i) => ({ ...x, tagScore: scores[i].score, tags: scores[i].matched }))
    .filter((x) => x.tagScore > 0)
  if (fits.length < 2) return null
  const rank = (x) => x.tagScore + TAGS.tasteWeight * (x.score / top)
  return fits.sort((a, b) => rank(b) - rank(a))
}

async function byMood(found, target) {
  try {
    const features = await getAudioFeatures(found.map((x) => x.song.id))
    const scored = found.map((x) => ({ ...x, mood: distance(features[x.song.id], target) }))
    const within = (limit) => scored.filter((x) => x.mood <= limit)
    const strict = within(FILTERS.maxMoodDistance)
    const relaxed = within(FILTERS.maxMoodDistance + FILTERS.relaxBy)
    const fits = strict.length >= 2 ? strict : relaxed.length ? relaxed : scored
    const top = Math.max(...fits.map((x) => x.score), 1)
    const rank = (x) => (Number.isFinite(x.mood) ? x.mood : 1) - 0.1 * (x.score / top)
    return fits.sort((a, b) => rank(a) - rank(b))
  } catch {
    return found
  }
}

async function orderFound(found, { tagMood, target, hasMood }) {
  const tagged = tagMood ? await byTags(found, tagMood).catch(() => null) : null
  if (tagged) return tagged
  return hasMood ? byMood(found, target) : [...found].sort((a, b) => b.score - a.score)
}

function chooseNew(ordered, n) {
  const out = []
  let fromTags = 0
  for (const x of ordered) {
    if (out.length === n) break
    if (x.fromTag && fromTags >= TAGS.maxPicks) continue
    if (x.fromTag) fromTags++
    out.push(x)
  }
  return out
}

function explain({ chosen, songs, mood, hasMood, lifting, feedback, genreNote }) {
  const count = chosen.length
  const knownCount = songs.length - count
  const tagSource = chosen.find((x) => x.fromTag)?.fromTag
  const allFromTags = chosen.every((x) => x.fromTag)

  const how = hasMood ? (lifting ? ', picked to ease your stress' : `, tuned to feel ${stateOf(mood).feel}`) : ''
  const source = !tagSource
    ? 'that fans of your top tracks and liked songs also play'
    : allFromTags
      ? `from Last.fm's top "${tagSource}" tracks`
      : `from fans of your top tracks and Last.fm's top "${tagSource}" tracks`
  const tagWords = [...new Set(chosen.flatMap((x) => (x.tags?.length ? x.tags : x.fromTag ? [x.fromTag] : [])))].slice(0, 3)
  const tagLine = tagWords.length ? ` Listeners tag ${count === 1 ? 'it' : 'them'} ${joinWords(tagWords)}.` : ''
  const knownLine = knownCount ? ` Plus ${knownCount} you already love.` : ''
  const note = feedback.liked.length || feedback.disliked.length ? ` Shaped by your ratings on past ${mood ? mood.toLowerCase() : 'no-mood'} picks.` : ''

  return `${count} new ${count === 1 ? 'find' : 'finds'} ${source}${how}.${tagLine}${knownLine}${genreNote}${note}`
}

export async function getPicks({ top, library, pool, mood, mode, state, aim = null, exclude = [], alreadyShown = [], feedback = { liked: [], disliked: [] } }) {
  const prefs = loadGenrePrefs()
  if (hasGenrePrefs(prefs)) {
    top = await fillGenres(top)
    pool = await fillGenres(pool)
    library = await fillGenres(library)
  }
  const allowed = notAvoided(prefs)
  top = top.filter(allowed)
  library = library.filter(allowed)
  pool = pool.filter(allowed)

  const likedHits = new Map()
  const withGenres = async (list, n) => {
    const checks = await checkGenres(list, prefs)
    list.forEach((s, i) => checks[i].liked && likedHits.set(s.id, checks[i].liked))
    return likedFirst(list.filter((_, i) => !checks[i].avoided), (s) => likedHits.has(s.id)).slice(0, n)
  }
  const genreNote = (songs) => {
    const hits = [...new Set(songs.map((s) => likedHits.get(s.id)).filter(Boolean))]
    return hits.length ? ` Leaning toward ${joinWords(hits.map((g) => g.toLowerCase()))}, which you like.` : ''
  }

  const lifting = mode === MODES.lift && Boolean(mood)
  const baseTarget = aim && !lifting ? aim : targetFor(mood, lifting, state)
  const hasMood = Object.keys(baseTarget).length > 0
  const tagMood = effectiveMood(mood, lifting)
  const useTags = Boolean(tagMood) && isLastfmConfigured()

  const dislikedIds = new Set(feedback.disliked.map((s) => s.id))
  const skip = new Set([...exclude, ...dislikedIds])
  const topSongs = top.slice(0, 40)
  const likedSongs = library.slice(0, 40)
  const everything = [...pool, ...library]
  const rated = [...feedback.liked, ...feedback.disliked, ...alreadyShown]
  const knownKeys = new Set([...everything, ...rated].map((s) => songKey(s.artist, s.title)))
  const knownIds = new Set([...everything, ...rated].map((s) => s.id))
  const profile = libraryProfile(everything)

  if (!topSongs.length && !likedSongs.length) {
    const familiar = pickSongs(pool, mood, mode, [...skip], prefs)
    return { ...familiar, reason: `${familiar.reason} New finds need top tracks or liked songs.` }
  }

  const upvoted = feedback.liked.filter((s) => !dislikedIds.has(s.id))
  const shownKeys = new Set(alreadyShown.map((s) => songKey(s.artist, s.title)))
  const notShown = (s) => !shownKeys.has(songKey(s.artist, s.title))
  const fromFeedback = [...shuffle(upvoted.slice(0, 3)), ...shuffle(upvoted.slice(3, 12))].slice(0, FEEDBACK.likedSeeds)

  const features = await getAudioFeatures([...topSongs, ...likedSongs, ...upvoted.slice(0, 12)].map((s) => s.id)).catch(() => ({}))
  const taste = averageOf(upvoted.slice(0, 12).map((s) => features[s.id]))
  const tasteAmount = Math.min(FEEDBACK.tasteMax, FEEDBACK.tasteBase + FEEDBACK.tasteStep * upvoted.length)
  const target = hasMood && Object.keys(taste).length ? blend(baseTarget, taste, tasteAmount) : baseTarget
  const useFeatures = hasMood && Object.values(features).some(Boolean)

  const pickForMood = async (list, n) => {
    const tagged = useTags ? await rankByTags(list, tagMood, n) : []
    const backup = useFeatures ? closest(list, features, target, n + tagged.length) : shuffle(list.slice(0, 20))
    return uniqueBy([...tagged, ...backup], (s) => s.id).slice(0, n)
  }

  const perGroup = fromFeedback.length ? 2 : 3
  const usable = (list) => list.filter((s) => !dislikedIds.has(s.id))
  const [seedTop, seedLiked] = await Promise.all([pickForMood(usable(topSongs), perGroup), pickForMood(usable(likedSongs), perGroup)])
  const seeds = uniqueBy([...fromFeedback, ...seedTop, ...seedLiked], (s) => s.id)
  const seedIds = new Set(seeds.map((s) => s.id))

  const familiarPool = uniqueBy([...topSongs, ...likedSongs, ...upvoted], (s) => s.id).filter(
    (s) => !skip.has(s.id) && !seedIds.has(s.id) && notShown(s)
  )
  const familiarOptions = await withGenres(await pickForMood(familiarPool, 8), 5)
  const familiar = shuffle(familiarOptions)[0]

  const familiarOnly = (reason) => {
    const songs = (
      familiar
        ? [familiar, ...familiarOptions.filter((s) => s.id !== familiar.id)]
        : pickSongs(pool, mood, mode, [...skip], prefs).songs.filter(notShown)
    ).slice(0, 3)
    return { songs, reason: `${reason}${genreNote(songs)}` }
  }

  if (!isLastfmConfigured()) {
    return familiarOnly('Add your Last.fm API key to .env to get new finds. These are from your top tracks and liked songs.')
  }

  try {
    const penalties = feedback.disliked.length ? await dislikePenalties(feedback.disliked) : new Map()
    const [ranked, tagged] = await Promise.all([
      findCandidates(seeds, knownKeys, profile, { boosted: new Set(fromFeedback.map((s) => s.id)), penalties }),
      useTags ? tagCandidates(tagMood, knownKeys, profile, prefs.liked) : [],
    ])

    const similar = shuffle(ranked.slice(0, 16)).slice(0, tagged.length ? 10 - TAGS.searched : 10)
    const similarKeys = new Set(similar.map((c) => songKey(c.artist, c.title)))
    const fromTags = tagged.filter((c) => !similarKeys.has(songKey(c.artist, c.title))).slice(0, TAGS.searched)

    const resolved = await resolveOnSpotify([...similar, ...fromTags], knownIds, skip)
    const checks = await checkGenres(resolved.map((x) => x.song), prefs)
    resolved.forEach((x, i) => checks[i].liked && likedHits.set(x.song.id, checks[i].liked))
    const found = resolved.filter((_, i) => !checks[i].avoided)
    if (!found.length) throw new Error('No new songs found on Spotify.')

    const ordered = likedFirst(await orderFound(found, { tagMood, target, hasMood }), (x) => likedHits.has(x.song.id))
    const chosen = chooseNew(ordered, 2)
    const newSongs = chosen.map((x) => ({ ...x.song, isNew: true }))

    const extraFamiliar = familiarOptions.filter((s) => s.id !== familiar?.id).slice(0, 2 - newSongs.length)
    const songs = [...newSongs, ...(familiar ? [familiar, ...extraFamiliar] : extraFamiliar)].slice(0, 3)

    return { songs, reason: explain({ chosen, songs, mood, hasMood, lifting, feedback, genreNote: genreNote(songs) }) }
  } catch {
    return familiarOnly('Couldn’t find new songs this time, so these are from your top tracks and liked songs.')
  }
}

const MIX = { artists: 8, similarFrom: 5, similarPer: 3, ownTracks: 20, similarTracks: 4, perArtist: 2, minFit: 6, minStyle: 3 }

function capPerArtist(list, max) {
  const counts = new Map()
  return list.filter((x) => {
    const artist = firstArtist(x.song.artist).toLowerCase()
    const n = counts.get(artist) ?? 0
    if (n >= max) return false
    counts.set(artist, n + 1)
    return true
  })
}

function favoriteArtists(top, pool, library, n) {
  const weights = new Map()
  const add = (list, weight) =>
    list.forEach((s) => {
      const name = firstArtist(s.artist)
      weights.set(name, (weights.get(name) ?? 0) + weight)
    })
  add(library, 1)
  add(pool, 2)
  add(top, 4)
  return [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => name)
}

const interleave = (a, b) => {
  const out = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i])
    if (b[i]) out.push(b[i])
  }
  return out
}

export async function discoverSongs({ top, library, pool, mood, state, lifting = false, focus = null, stayIn = [], sound = null, trace = null, count = 20, exclude = [], feedback = { liked: [], disliked: [] } }) {
  if (!isLastfmConfigured()) return []
  const prefs = loadGenrePrefs()
  if (hasGenrePrefs(prefs)) {
    top = await fillGenres(top)
    pool = await fillGenres(pool)
    library = await fillGenres(library)
  }
  const allowed = notAvoided(prefs)
  top = top.filter(allowed)
  library = library.filter(allowed)
  pool = pool.filter(allowed)

  const skip = new Set([...exclude, ...feedback.disliked.map((s) => s.id)])
  const everything = [...pool, ...library]
  const known = [...everything, ...feedback.liked, ...feedback.disliked]
  const knownKeys = new Set(known.map((s) => songKey(s.artist, s.title)))
  const knownIds = new Set(known.map((s) => s.id))
  const profile = libraryProfile(everything)

  const artists = focus
    ? favoriteArtists([], [], focus, MIX.artists)
    : shuffle(favoriteArtists(top, pool, library, MIX.artists * 2)).slice(0, MIX.artists)
  if (trace) trace.artists = artists.length
  if (!artists.length) return []
  const own = new Set(artists.map((a) => a.toLowerCase()))
  const owned = new Set(everything.map((s) => firstArtist(s.artist).toLowerCase()))

  const [ownLists, similarLists] = await Promise.all([
    Promise.all(artists.map((a) => getArtistTopTracks(a, MIX.ownTracks).catch(() => []))),
    Promise.all(
      artists.slice(0, MIX.similarFrom).map(async (a) => {
        const similar = (await getSimilarArtists(a, 8).catch(() => []))
          .filter((x) => !own.has(x.name.toLowerCase()))
          .sort((x, y) => Number(owned.has(y.name.toLowerCase())) - Number(owned.has(x.name.toLowerCase())) || y.match - x.match)
          .slice(0, MIX.similarPer)
        return Promise.all(similar.map((x) => getArtistTopTracks(x.name, MIX.similarTracks).catch(() => [])))
      })
    ),
  ])

  const fresh = (list) =>
    list.filter((c) => !knownKeys.has(songKey(c.artist, c.title)) && passesLanguage(c, profile))
  const ownRounds = Math.max(0, ...ownLists.map((l) => l.length))
  const ownOrdered = []
  for (let r = 0; r < ownRounds; r++) ownLists.forEach((l) => l[r] && ownOrdered.push(l[r]))
  const simOrdered = []
  const simLists = similarLists.flat()
  for (let r = 0; r < MIX.similarTracks; r++) simLists.forEach((l) => l[r] && simOrdered.push(l[r]))

  if (trace) trace.lastfm = ownOrdered.length + simOrdered.length
  const candidates = uniqueBy(fresh(interleave(ownOrdered, simOrdered)), (c) => songKey(c.artist, c.title)).slice(0, Math.max(30, count * 4))
  if (trace) trace.fresh = candidates.length
  const resolved = await resolveOnSpotify(candidates.map((c) => ({ ...c, score: 0 })), knownIds, skip, { stopAt: count * 3, trace })
  if (trace) trace.onSpotify = resolved.length
  const checks = await checkGenres(resolved.map((x) => x.song), prefs)
  const styled = stayIn.length ? await fillGenres(resolved.map((x) => x.song)) : null
  const unavoided = resolved.filter((_, i) => !checks[i].avoided)
  const inStyle = styled
    ? resolved.filter((_, i) => !checks[i].avoided && (!styled[i].genres?.length || inGenres(styled[i], stayIn)))
    : unavoided
  const found = inStyle.length >= MIX.minStyle ? inStyle : unavoided
  if (trace) trace.kept = found.length
  if (!found.length) return []
  const likedIds = new Set(resolved.filter((_, i) => checks[i].liked).map((x) => x.song.id))

  const target = sound ?? targetFor(mood, lifting, state)
  let ordered = found
  if (Object.keys(target).length) {
    try {
      const features = await getAudioFeatures(found.map((x) => x.song.id))
      const scored = found.map((x, i) => ({ ...x, i, d: distance(features[x.song.id], target) }))
      const limit = FILTERS.maxMoodDistance + FILTERS.relaxBy
      const fits = scored.filter((x) => x.d <= limit)
      const byFit = [...scored].sort((a, b) => (Number.isFinite(a.d) ? a.d : 9) - (Number.isFinite(b.d) ? b.d : 9))
      const base = fits.length >= MIX.minFit ? fits : byFit.slice(0, Math.max(MIX.minFit, count))
      ordered = base.sort((a, b) => a.i - b.i)
    } catch {
      ordered = found
    }
  }

  return boostLiked(capPerArtist(ordered, MIX.perArtist), (x) => likedIds.has(x.song.id))
    .slice(0, count)
    .map((x) => ({ ...x.song, isNew: true }))
}
