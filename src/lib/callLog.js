const LOG_KEY = 'moodbot:spotify-calls'
const LIMIT_KEY = 'moodbot:spotify-limits'
const WINDOW_MS = 30 * 1000
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MAX_ENTRIES = 5000
const GUESS_WINDOW = 90

const listeners = new Set()

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

let calls = read(LOG_KEY, [])
let limits = read(LIMIT_KEY, { window: null, day: null, lastBlock: null })
let total = calls.length

const endpoint = (url) =>
  new URL(url).pathname
    .replace(/^\/v1/, '')
    .replace(/\/[A-Za-z0-9]{22}(?=\/|$)/g, '/:id')

const countSince = (ms, now = Date.now()) => calls.filter((c) => c.at > now - ms).length

export function callStats(now = Date.now()) {
  const windowLimit = limits.window ?? GUESS_WINDOW
  const last30s = countSince(WINDOW_MS, now)
  const today = countSince(DAY_MS, now)
  const blockedUntil = limits.lastBlock?.until ?? 0
  return {
    last30s,
    lastHour: countSince(HOUR_MS, now),
    today,
    windowLimit,
    windowLearned: limits.window != null,
    dayLimit: limits.day,
    leftWindow: Math.max(0, windowLimit - last30s),
    leftDay: limits.day == null ? null : Math.max(0, limits.day - today),
    lastBlock: limits.lastBlock,
    blockedFor: Math.max(0, blockedUntil - now),
  }
}

const emit = () => listeners.forEach((fn) => fn(callStats()))

export function onCalls(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function logCall(method, url, status) {
  const now = Date.now()
  calls = calls.filter((c) => c.at > now - DAY_MS).slice(-MAX_ENTRIES + 1)
  calls.push({ at: now, method, path: endpoint(url), status })
  total += 1
  write(LOG_KEY, calls)

  const s = callStats(now)
  if (import.meta.env.DEV && status !== 429) {
    const left = s.dayLimit == null ? '' : ` · ~${s.leftDay} left today`
    console.debug(`[spotify] #${total} ${method} ${endpoint(url)} ${status} · ${s.last30s}/${s.windowLimit} in 30s · ${s.today} today${left}`)
  }
  emit()
}

export function logBlock(retryAfter, quota) {
  const now = Date.now()
  const inWindow = countSince(WINDOW_MS, now)
  const inDay = countSince(DAY_MS, now)
  limits = {
    window: quota ? limits.window : Math.min(limits.window ?? Infinity, inWindow),
    day: quota ? Math.min(limits.day ?? Infinity, inDay) : limits.day,
    lastBlock: { at: now, until: now + retryAfter * 1000, inWindow, inDay, quota },
  }
  write(LIMIT_KEY, limits)
  if (import.meta.env.DEV) {
    console.warn(`[spotify] blocked${quota ? ' (quota)' : ''} at ${inWindow} in 30s, ${inDay} in 24h · retry in ${retryAfter}s`)
  }
  emit()
}

export function printCalls() {
  const byPath = {}
  calls.forEach((c) => {
    const key = `${c.method} ${c.path}`
    byPath[key] = (byPath[key] ?? 0) + 1
  })
  console.table(
    Object.entries(byPath)
      .sort((a, b) => b[1] - a[1])
      .map(([endpoint, count]) => ({ endpoint, count }))
  )
  console.log('[spotify] stats', callStats())
}

export function resetCalls({ limits: alsoLimits = false } = {}) {
  calls = []
  total = 0
  write(LOG_KEY, calls)
  if (alsoLimits) {
    limits = { window: null, day: null, lastBlock: null }
    write(LIMIT_KEY, limits)
  }
  emit()
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.spotifyCalls = printCalls
  window.spotifyCalls.reset = resetCalls
}
