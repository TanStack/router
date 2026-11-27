/**
 * Kept: the sole coverage of a dev window no oracle test reaches. The
 * window is a host read of a marked module still in flight
 * when that file's change event lands; a dev server or watch build cannot
 * hold its filesystem read open, and the oracle settles edits by their
 * outcome with no hold point inside a read, so no public input meets it
 * deterministically. To become a behaviour test of a dev server if the
 * harness ever gets a held read.
 *
 * A module edited while `marker` reads it: once the edit's event landed,
 * the cache answers the edited text, whether the event carries the text
 * (`markStale(path, read)`), only marks the path (`markStale(path)`), or
 * expires a virtual module (`expireVirtual`). The read in flight held the
 * text from before the edit and, since it held a marker literal, `marker`
 * went on to build the target facts.
 * Source: Fable's re-check of the marker's read (`stale.mjs`).
 */
import { describe, expect, it } from 'vitest'
import { RawFactsCache } from '../src/compiler'

const spec = '@tanstack/react-start/server-only'
const before = `import '${spec}'\nexport const before = 1\n`
const edited = `export const after = 2\n`

type Event = 'event with its text' | 'plain event' | 'expireVirtual'

/** A cache whose first read of the module is held until `release`: it returns the text it found when it started. */
function heldFirstRead() {
  let text = before
  let reads = 0
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  const read = async () => {
    reads++
    const found = text
    if (reads === 1) {
      await held
    }
    return found
  }
  const cache = new RawFactsCache({
    readFile: read,
    loadVirtual: read,
    markerSpecifiers: { [spec]: 'server-only' },
  })
  return {
    cache,
    release,
    edit: () => (text = edited),
  }
}

describe('a module edited while marker reads it', () => {
  it.each<[Event, string]>([
    ['event with its text', '/app/src/mod.ts'],
    ['plain event', '/app/src/mod.ts'],
    ['expireVirtual', '\0virtual:mod'],
  ])('%s: the cache answers the edited text', async (event, id) => {
    const { cache, release, edit } = heldFirstRead()
    const first = cache.marker(id, 'client')
    // (the read has started: its text is the one before the edit)
    await Promise.resolve()
    edit()
    if (event === 'expireVirtual') {
      cache.expireVirtual('client')
    } else if (event === 'event with its text') {
      cache.markStale(id, { text: edited, revision: 'edited' })
    } else {
      cache.markStale(id)
    }
    release()
    await first
    expect(await cache.marker(id, 'client')).toBeNull()
    expect(
      Object.keys((await cache.get(id, 'client')).summary?.exports ?? {}),
    ).toEqual(['after'])
  })
})
