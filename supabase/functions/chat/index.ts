// @ts-nocheck
import { SYSTEM_PROMPT } from './personality.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const fallbackReply = 'Sorry, I lost my train of thought. Try that again?'

const INTENTS = ['songs', 'playlist', 'playlists', 'talk']
const DIMS = ['energy', 'valence', 'danceability', 'acousticness', 'instrumentalness']
const MAX_TOKENS = 2048

const toTarget = (value: unknown) => {
  if (!value || typeof value !== 'object') return null
  const out: Record<string, number> = {}
  for (const k of DIMS) {
    const n = Number((value as Record<string, unknown>)[k])
    if (Number.isFinite(n)) out[k] = Math.min(1, Math.max(0, n))
  }
  return Object.keys(out).length ? out : null
}

type Ask = { artists: string[]; genres: string[]; bpm: { min: number; max: number } | null; sound: Record<string, number> | null; notes: string }

const toList = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim().slice(0, 60)).slice(0, 5)
    : []

const toAsk = (value: unknown): Ask | null => {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, any>
  const min = Math.round(Number(v.bpm?.min))
  const max = Math.round(Number(v.bpm?.max))
  const ask = {
    artists: toList(v.artists),
    genres: toList(v.genres),
    bpm: min >= 40 && max <= 220 && min <= max ? { min, max } : null,
    sound: toTarget(v.sound),
    notes: typeof v.notes === 'string' ? v.notes.trim().slice(0, 120) : '',
  }
  return ask.artists.length || ask.genres.length || ask.bpm || ask.sound || ask.notes ? ask : null
}

const NO_STEREOTYPE =
  "If they asked for an activity or vibe, do not assume a genre for it. Studying does not mean classical or lofi, and the gym does not mean EDM. Pick from the kind of music they already listen to that suits the activity's energy."

const tasteText = (taste: unknown) => {
  const t = (taste && typeof taste === 'object' ? taste : {}) as Record<string, unknown>
  const artists = toList(t.artists).join(', ')
  const genres = toList(t.genres).join(', ')
  return `Artists they already like: ${artists || 'unknown'}. Genres they listen to: ${genres || 'unknown'}.`
}

const askText = (value: unknown) => {
  const ask = toAsk(value)
  if (!ask) return 'Match the energy of their mood.'
  const parts = [
    ask.artists.length && `artists: ${ask.artists.join(', ')}`,
    ask.genres.length && `genres: ${ask.genres.join(', ')}`,
    ask.bpm && `tempo between ${ask.bpm.min} and ${ask.bpm.max} BPM`,
    ask.sound && `sound (0 to 1): ${Object.entries(ask.sound).map(([k, n]) => `${k} ${n}`).join(', ')}`,
    ask.notes && `also: ${ask.notes}`,
  ].filter(Boolean)
  return `What they asked for comes first: ${parts.join('; ')}. Every song must fit that. Use their mood only to choose between songs that already fit.`
}

const toStress = (value: unknown) => {
  const n = Math.round(Number(value))
  return value != null && n >= 1 && n <= 5 ? n : null
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const parseJson = (text: string) => {
  try {
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  } catch {
    return null
  }
}

type Msg = { role: string; content: string }

async function groq(system: string | null, messages: Msg[]) {
  const key = Deno.env.get('GROQ_API_KEY')
  if (!key) return null
  const model = Deno.env.get('GROQ_MODEL') ?? 'openai/gpt-oss-120b'
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: MAX_TOKENS,
        ...(model.startsWith('openai/gpt-oss') && { reasoning_effort: 'low' }),
      }),
    })
    if (!res.ok) {
      console.error('groq failed', model, res.status, (await res.text()).slice(0, 400))
      return null
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? null
  } catch (err) {
    console.error('groq error', model, String(err))
    return null
  }
}

async function gemini(system: string | null, messages: Msg[]) {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return null
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
  const ask = (name: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(system && { systemInstruction: { parts: [{ text: system }] } }),
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: MAX_TOKENS, responseMimeType: 'application/json' },
      }),
    })
  try {
    let res = await ask(model)
    if (!res.ok && res.status >= 500) res = await ask(model)
    const backup = Deno.env.get('GEMINI_FALLBACK_MODEL')
    if (res.status === 429 && backup) res = await ask(backup)
    if (!res.ok) {
      console.error('gemini failed', model, res.status, (await res.text()).slice(0, 400))
      return null
    }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null
  } catch (err) {
    console.error('gemini error', model, String(err))
    return null
  }
}

const providers = [
  ['groq', groq],
  ['gemini', gemini],
] as const

async function generate(system: string | null, messages: Msg[]) {
  for (const [name, call] of providers) {
    const text = await call(system, messages)
    if (text == null) continue
    const parsed = parseJson(text)
    if (parsed) return parsed
    console.error(`${name} unparseable`, text.slice(0, 200))
  }
  return null
}

async function pickSongs(prompt: string) {
  const parsed = await generate(null, [{ role: 'user', content: prompt }])
  const list = (Array.isArray(parsed?.songs) ? parsed.songs : []).filter((s: { title?: string; artist?: string }) => s?.title && s?.artist)
  return json({ songs: list.map((s: { title: string; artist: string }) => ({ title: String(s.title), artist: String(s.artist) })) })
}

function songs({ mood, count, avoid }: { mood: string; count: number; avoid: { title: string; artist: string }[] }) {
  const n = Math.min(Math.max(Number(count) || 15, 1), 30)
  const skip = (Array.isArray(avoid) ? avoid : []).map((s) => `${s.title} by ${s.artist}`).join('; ')
  return pickSongs(
    `List ${n} real, popular songs that fit a ${String(mood).slice(0, 20)} mood. Mix artists and eras. Do not repeat these: ${skip || 'none'}. Reply with only JSON: {"songs":[{"title":"","artist":""}]}`
  )
}

function recommend({ request, ask, mood, artists, avoid, count }: { request: string; ask: unknown; mood: string; artists: string[]; avoid: { title: string; artist: string }[]; count: number }) {
  const n = Math.min(Math.max(Number(count) || 6, 1), 12)
  const skip = (Array.isArray(avoid) ? avoid : []).slice(0, 60).map((s) => `${s.title} by ${s.artist}`).join('; ')
  const known = (Array.isArray(artists) ? artists : []).slice(0, 10).map((a) => String(a).slice(0, 60)).join(', ')
  return pickSongs(`A user asked a music app for songs. Their message: "${String(request).slice(0, 300)}". Their mood: ${String(mood || 'unknown').slice(0, 20)}.
Pick ${n} real songs that match what they asked for, whether that is an artist, genre, vibe, or activity. If they named an artist, about half should be by that artist and the rest by artists with a very similar sound. ${askText(ask)} Artists they already like: ${known || 'unknown'}. ${NO_STEREOTYPE} Do not repeat these: ${skip || 'none'}.
Reply with only JSON: {"songs":[{"title":"","artist":""}]}`)
}

async function focusMix({ focus, ask, taste, mood, count, avoid }: { focus: string; ask: unknown; taste: unknown; mood: string; count: number; avoid: { title: string; artist: string }[] }) {
  const n = Math.min(Math.max(Number(count) || 24, 1), 30)
  const skip = (Array.isArray(avoid) ? avoid : []).slice(0, 60).map((s) => `${s.title} by ${s.artist}`).join('; ')
  const parsed = await generate(null, [
    {
      role: 'user',
      content: `A user asked a music app for a playlist built around: "${String(focus).slice(0, 80)}". Their mood: ${String(mood || 'unknown').slice(0, 20)}.
If that is an artist, set "artist" to their name as it appears on Spotify and list ${n} real songs: about half by that artist and the rest by artists with a very similar sound and genre.
If it is a genre, set "artist" to "" and list ${n} real songs that clearly fit it.
If it is an activity or vibe, set "artist" to "" and list ${n} real songs that suit it. ${NO_STEREOTYPE} Use their taste: mostly these genres, these artists, and artists like them.
${tasteText(taste)}
${askText(ask)} Do not repeat these: ${skip || 'none'}.
Reply with only JSON: {"artist":"","songs":[{"title":"","artist":""}]}`,
    },
  ])
  const list = (Array.isArray(parsed?.songs) ? parsed.songs : []).filter((s: { title?: string; artist?: string }) => s?.title && s?.artist)
  return json({
    artist: typeof parsed?.artist === 'string' ? parsed.artist.slice(0, 80) : '',
    songs: list.map((s: { title: string; artist: string }) => ({ title: String(s.title), artist: String(s.artist) })),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const body = await req.json()

  if (body.mode === 'songs') return songs(body)
  if (body.mode === 'recommend') return recommend(body)
  if (body.mode === 'focus') return focusMix(body)

  const { messages } = body
  if (!Array.isArray(messages) || !messages.length) return json({ error: 'No messages' }, 400)

  const parsed = await generate(SYSTEM_PROMPT, messages)
  if (!parsed) return json({ error: 'unavailable' }, 502)

  return json({
    reply: String(parsed.reply ?? fallbackReply),
    mood: String(parsed.mood ?? ''),
    intent: INTENTS.includes(parsed.intent) ? parsed.intent : 'talk',
    focus: String(parsed.focus ?? '').slice(0, 80),
    target: toTarget(parsed.target),
    ask: toAsk(parsed.ask),
    stress: toStress(parsed.stress),
  })
})
