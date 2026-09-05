import { beforeEach, describe, expect, test } from 'vitest'
import {
  clearModuleNotFoundReload,
  getModuleNotFoundReloadKey,
  isModuleNotFoundReloadPending,
  shouldReloadForModuleNotFound,
} from '../src'

/**
 * The reload guard in every framework's `lazyRouteComponent` records, per
 * module, that it has already reloaded the document once for a missing chunk.
 *
 * Two properties have to hold together: one module failing must never spend
 * another module's reload, and a session must be able to recover from more
 * than one deployment. The key provides the first, and clearing it on a
 * successful load provides the second.
 */

// Stand-ins for what bundlers emit. Vite and Rollup inline the content-hashed
// filename, so the source changes whenever the chunk does...
const importPostsBuildA = () => Promise.resolve({ chunk: './posts-a1b2c3.js' })
const importUsersBuildA = () => Promise.resolve({ chunk: './users-d4e5f6.js' })
const importPostsBuildB = () => Promise.resolve({ chunk: './posts-g7h8i9.js' })

// ...while webpack and rspack compile the specifier away and leave only a
// chunk id, which is unique per module but survives a rebuild unchanged.
const requirePostsChunk = () => Promise.resolve({ chunkId: 437 })
const requireUsersChunk = () => Promise.resolve({ chunkId: 512 })

beforeEach(() => {
  sessionStorage.clear()
})

describe('getModuleNotFoundReloadKey', () => {
  test('separates modules, whatever the browser called the failure', () => {
    // Safari reports every failed import as the bare "Importing a module
    // script failed.", so the error cannot be part of the key at all.
    expect(getModuleNotFoundReloadKey(importPostsBuildA)).not.toBe(
      getModuleNotFoundReloadKey(importUsersBuildA),
    )
  })

  test('separates modules a bundler identifies only by chunk id', () => {
    expect(getModuleNotFoundReloadKey(requirePostsChunk)).not.toBe(
      getModuleNotFoundReloadKey(requireUsersChunk),
    )
  })

  test('is stable for the same importer, so it still guards the loop', () => {
    // The key has to survive the very reload it guards, or the guard reads as
    // unspent on the next document and reloads again.
    expect(getModuleNotFoundReloadKey(importPostsBuildA)).toBe(
      getModuleNotFoundReloadKey(importPostsBuildA),
    )
  })

  test('changes when a rebuilt chunk is named in the importer', () => {
    expect(getModuleNotFoundReloadKey(importPostsBuildA)).not.toBe(
      getModuleNotFoundReloadKey(importPostsBuildB),
    )
  })

  test('carries the importer source verbatim, so it cannot collide', () => {
    expect(getModuleNotFoundReloadKey(importPostsBuildA)).toBe(
      `tanstack_router_reload:${importPostsBuildA.toString()}`,
    )
  })

  test('keeps the documented key prefix', () => {
    expect(getModuleNotFoundReloadKey(importPostsBuildA)).toMatch(
      /^tanstack_router_reload:/,
    )
  })
})

describe('shouldReloadForModuleNotFound', () => {
  test('grants a stale module one reload and no more', () => {
    expect(shouldReloadForModuleNotFound(importPostsBuildA)).toBe(true)
    expect(shouldReloadForModuleNotFound(importPostsBuildA)).toBe(false)
  })

  test('grants each module its own', () => {
    shouldReloadForModuleNotFound(importPostsBuildA)

    expect(shouldReloadForModuleNotFound(importUsersBuildA)).toBe(true)
  })

  test('grants another once the module has loaded again', () => {
    // The deployment this one was reaching for arrived, so a later one that
    // leaves it stale again gets its own reload.
    shouldReloadForModuleNotFound(importPostsBuildA)
    clearModuleNotFoundReload(importPostsBuildA)

    expect(shouldReloadForModuleNotFound(importPostsBuildA)).toBe(true)
  })
})

describe('clearModuleNotFoundReload', () => {
  test('returns the reload a recovered module spent', () => {
    // Without this, a key that cannot change per build — a webpack chunk id —
    // would leave the module unable to reload for any later deployment.
    const key = getModuleNotFoundReloadKey(requirePostsChunk)
    sessionStorage.setItem(key, '1')

    clearModuleNotFoundReload(requirePostsChunk)

    expect(sessionStorage.getItem(key)).toBeNull()
  })

  test('leaves other modules alone, so a broken one cannot loop', () => {
    // A module that is genuinely missing never loads, so its entry is never
    // cleared — least of all by a healthy route loading beside it.
    const brokenKey = getModuleNotFoundReloadKey(requireUsersChunk)
    sessionStorage.setItem(brokenKey, '1')

    clearModuleNotFoundReload(requirePostsChunk)

    expect(sessionStorage.getItem(brokenKey)).toBe('1')
  })

  test('is a no-op for a module that never reloaded', () => {
    expect(() => clearModuleNotFoundReload(importPostsBuildA)).not.toThrow()
    expect(sessionStorage.length).toBe(0)
  })
})

describe('isModuleNotFoundReloadPending', () => {
  /**
   * `window.location.reload()` only schedules the navigation. Renders keep
   * running until it lands, and by then the key is spent, so the reload guard
   * alone would let one of those renders fall through to the error.
   */
  test('reports the reload the guard just started', () => {
    expect(shouldReloadForModuleNotFound(importUsersBuildA)).toBe(true)

    expect(isModuleNotFoundReloadPending()).toBe(true)
  })

  test('stays set once the key it spent is gone', () => {
    // The document is still on its way out; nothing that happens to storage
    // afterwards makes the error worth showing.
    clearModuleNotFoundReload(importUsersBuildA)

    expect(isModuleNotFoundReloadPending()).toBe(true)
  })
})
