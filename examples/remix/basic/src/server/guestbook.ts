/**
 * Server functions backing `/guestbook`. Demonstrates the full
 * `createServerFn` chain with `.inputValidator` (checks/transforms the
 * incoming request payload) and `.handler` (runs server-side).
 *
 * State lives in module-level memory — fine for the demo, would be a
 * DB/KV in a real app. Both the GET (list) and POST (add) live here so
 * the heavy validation logic and the storage backend stay server-only.
 */
import { createServerFn } from '@tanstack/remix-start'

export interface GuestbookEntry {
  id: number
  name: string
  message: string
  at: string
}

const entries: Array<GuestbookEntry> = [
  {
    id: 1,
    name: 'Tanner',
    message: 'Hello from the seed entry.',
    at: new Date().toISOString(),
  },
]
let nextId = entries.length + 1

export const listEntries = createServerFn({ method: 'GET' }).handler(() => [
  ...entries,
])

export interface AddEntryInput {
  name: string
  message: string
}

export const addEntry = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown): AddEntryInput => {
    if (typeof raw !== 'object' || raw == null) {
      throw new Error('expected object payload')
    }
    const r = raw as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const message = typeof r.message === 'string' ? r.message.trim() : ''
    if (!name) throw new Error('name is required')
    if (!message) throw new Error('message is required')
    if (name.length > 60) throw new Error('name too long')
    if (message.length > 280) throw new Error('message too long')
    return { name, message }
  })
  .handler(async ({ data }) => {
    entries.push({
      id: nextId++,
      name: data.name,
      message: data.message,
      at: new Date().toISOString(),
    })
    return [...entries]
  })
