export const FILTERS = {
  maxMoodDistance: 0.2,
  relaxBy: 0.08,
}

export const normalize = (text = '') =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*[([].*?[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

export const firstArtist = (artist = '') => artist.split(', ')[0]
const REMIX = /\b(remix|rework|bootleg|flip|vip)\b/i

const remixOf = (title = '') => {
  const parts = [...title.matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => m[1])
  const dash = title.match(/\s+-\s+(.*)$/)
  if (dash) parts.push(dash[1])
  const hit = parts.find((p) => REMIX.test(p))
  return hit ? normalize(hit) : ''
}

export const songKey = (artist, title) => {
  const remix = remixOf(title)
  return `${normalize(firstArtist(artist))}|${normalize(title)}${remix ? `|${remix}` : ''}`
}

export function shuffle(list) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const uniqueBy = (list, key) => [...new Map(list.map((x) => [key(x), x])).values()]

export function uniqueSongs(songs) {
  const ids = new Set()
  const keys = new Set()
  return songs.filter((s) => {
    const key = songKey(s.artist, s.title)
    if (ids.has(s.id) || keys.has(key)) return false
    ids.add(s.id)
    keys.add(key)
    return true
  })
}

export const joinWords = (words) =>
  words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`

export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const wordPattern = (word) => new RegExp(`(^|[\\s-])${escapeRegExp(word)}($|[\\s-])`)

const SCRIPTS = {
  hangul: /[가-힯ᄀ-ᇿ㄰-㆏]/,
  kana: /[぀-ヿ]/,
  han: /[一-鿿]/,
  cyrillic: /[Ѐ-ӿ]/,
  arabic: /[؀-ۿ]/,
  hebrew: /[֐-׿]/,
  thai: /[฀-๿]/,
  devanagari: /[ऀ-ॿ]/,
  greek: /[Ͱ-Ͽ]/,
}

const LATIN_LANGUAGES = {
  spanish: {
    chars: /[ñ¿¡áíóú]/,
    words: ['el', 'los', 'las', 'del', 'que', 'mi', 'quiero', 'contigo', 'sin', 'yo', 'eres', 'noche', 'vida', 'baila', 'mía', 'todo', 'corazón', 'amor', 'te', 'y', 'la', 'de'],
  },
  portuguese: {
    chars: /[ãõ]/,
    words: ['não', 'você', 'meu', 'minha', 'coração', 'saudade', 'pra', 'eu', 'com', 'amor', 'de'],
  },
  french: {
    chars: /[èêëîœ]/,
    words: ['le', 'les', 'je', 'moi', 'toi', 'pas', 'est', 'une', 'des', 'dans', 'avec', 'pour', 'amour', 'et', 'tu'],
  },
  german: {
    chars: /[ßäöü]/,
    words: ['ich', 'und', 'nicht', 'du', 'mein', 'liebe', 'der', 'die', 'das', 'ein', 'mit'],
  },
  italian: {
    chars: /[ìò]/,
    words: ['il', 'che', 'non', 'sei', 'mio', 'amore', 'cuore', 'della', 'per', 'ti', 'tu'],
  },
}

const ENGLISH_WORDS = new Set(['the', 'you', 'me', 'my', 'i', 'love', 'your', 'and', 'in', 'of', 'to', 'it', 'on', 'we', 'is', 'be', 'all', 'for'])

export const scriptsIn = (text) => Object.keys(SCRIPTS).filter((name) => SCRIPTS[name].test(text))

export function latinLanguageOf(title) {
  const lower = title.toLowerCase()
  const words = [...new Set(lower.split(/[^\p{L}']+/u).filter(Boolean))]
  if (words.some((w) => ENGLISH_WORDS.has(w))) return null

  let best = null
  let bestScore = 0
  for (const [name, { chars, words: markers }] of Object.entries(LATIN_LANGUAGES)) {
    const score = (chars.test(lower) ? 2 : 0) + words.filter((w) => markers.includes(w)).length
    if (score > bestScore) [best, bestScore] = [name, score]
  }
  return bestScore >= 2 ? best : null
}

const keepCommon = (counts, min) => new Set(Object.keys(counts).filter((k) => counts[k] >= min))

export function libraryProfile(songs) {
  const scripts = {}
  const languages = {}
  const artists = new Set()

  songs.forEach((s) => {
    scriptsIn(`${s.title} ${s.artist}`).forEach((sc) => (scripts[sc] = (scripts[sc] ?? 0) + 1))
    const lang = latinLanguageOf(s.title)
    if (lang) languages[lang] = (languages[lang] ?? 0) + 1
    s.artist.split(', ').forEach((a) => artists.add(a.toLowerCase()))
  })

  const min = Math.max(2, Math.round(songs.length * 0.02))
  return { scripts: keepCommon(scripts, min), languages: keepCommon(languages, min), artists }
}

export function passesLanguage(rec, profile) {
  if (scriptsIn(`${rec.title} ${rec.artist}`).some((sc) => !profile.scripts.has(sc))) return false
  const lang = latinLanguageOf(rec.title)
  return !lang || profile.languages.has(lang)
}
