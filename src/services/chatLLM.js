import { supabase } from '../lib/supabase'

const MAX_TURNS = 12

const toApiMessages = (messages) => {
  const turns = messages
    .filter((m) => m.text && !m.pending && !m.fallback)
    .map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text }))
    .slice(-MAX_TURNS)

  while (turns.length && turns[0].role !== 'user') turns.shift()
  return turns
}

export async function askMuse(messages) {
  if (!supabase) return null
  const turns = toApiMessages(messages)
  if (!turns.length) return null

  const { data, error } = await supabase.functions.invoke('chat', { body: { messages: turns } })
  if (error || !data?.reply) return null
  return data
}
