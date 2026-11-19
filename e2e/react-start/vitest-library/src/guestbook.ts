import { createServerFn } from '@tanstack/react-start'

// The state of this file. The handler of `signGuestbook` writes it, and the
// plain functions below read and empty it.
const entries: Array<string> = []

export const signGuestbook = createServerFn({ method: 'POST' })
  .validator((name: string) => name)
  .handler(({ data }) => {
    entries.push(data)
    return entries.length
  })

export function guestbookEntries(): ReadonlyArray<string> {
  return entries
}

export function clearGuestbook() {
  entries.length = 0
}
