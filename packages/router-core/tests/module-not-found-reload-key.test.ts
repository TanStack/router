import { beforeEach, describe, expect, test, vi } from 'vitest'

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

const keyFor = (importer: () => unknown) =>
  `tanstack_router_reload:${importer.toString()}`

/**
 * The pending flag lives for the life of the document, so each test needs a
 * fresh module instance to observe it going from unset to set.
 */
async function loadGuard() {
  vi.resetModules()
  return await import('../src/utils')
}

let reload: ReturnType<typeof vi.fn>

beforeEach(() => {
  sessionStorage.clear()
  // jsdom refuses a real navigation, and asserting on it is the point anyway.
  reload = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
})

describe('reload key', () => {
  test('separates modules, whatever the browser called the failure', async () => {
    // Safari reports every failed import as the bare "Importing a module
    // script failed.", so the error cannot be part of the key at all.
    const { reloadForModuleNotFound } = await loadGuard()

    reloadForModuleNotFound(importPostsBuildA)
    reloadForModuleNotFound(importUsersBuildA)

    expect(sessionStorage.getItem(keyFor(importPostsBuildA))).toBe('1')
    expect(sessionStorage.getItem(keyFor(importUsersBuildA))).toBe('1')
    expect(reload).toHaveBeenCalledTimes(2)
  })

  test('separates modules a bundler identifies only by chunk id', async () => {
    const { reloadForModuleNotFound } = await loadGuard()

    reloadForModuleNotFound(requirePostsChunk)
    reloadForModuleNotFound(requireUsersChunk)

    expect(sessionStorage.getItem(keyFor(requirePostsChunk))).toBe('1')
    expect(sessionStorage.getItem(keyFor(requireUsersChunk))).toBe('1')
  })

  test('changes when a rebuilt chunk is named in the importer', async () => {
    const { reloadForModuleNotFound } = await loadGuard()

    reloadForModuleNotFound(importPostsBuildA)

    expect(sessionStorage.getItem(keyFor(importPostsBuildB))).toBeNull()
  })

  test('carries the importer source verbatim, so it cannot collide', async () => {
    const { reloadForModuleNotFound } = await loadGuard()

    reloadForModuleNotFound(importPostsBuildA)

    expect(sessionStorage.key(0)).toBe(
      `tanstack_router_reload:${importPostsBuildA.toString()}`,
    )
  })
})

describe('reloadForModuleNotFound', () => {
  test('grants a stale module one reload and no more', async () => {
    const { reloadForModuleNotFound } = await loadGuard()

    reloadForModuleNotFound(importPostsBuildA)
    reloadForModuleNotFound(importPostsBuildA)

    // The key survives the very reload it guards, so the second document reads
    // it as spent rather than reloading again.
    expect(reload).toHaveBeenCalledTimes(1)
  })

  test('grants each module its own', async () => {
    const { reloadForModuleNotFound } = await loadGuard()

    reloadForModuleNotFound(importPostsBuildA)
    reloadForModuleNotFound(importUsersBuildA)

    expect(reload).toHaveBeenCalledTimes(2)
  })

  test('grants another once the module has loaded again', async () => {
    // The deployment this one was reaching for arrived, so a later one that
    // leaves it stale again gets its own reload.
    const { reloadForModuleNotFound, clearModuleNotFoundReload } =
      await loadGuard()

    reloadForModuleNotFound(importPostsBuildA)
    clearModuleNotFoundReload(importPostsBuildA)
    reloadForModuleNotFound(importPostsBuildA)

    expect(reload).toHaveBeenCalledTimes(2)
  })

  /**
   * `window.location.reload()` only schedules the navigation. Renders keep
   * running until it lands, and by then the key is spent, so the key alone
   * would let one of those renders fall through to the error.
   */
  test('keeps the caller waiting while the reload it started lands', async () => {
    const { reloadForModuleNotFound } = await loadGuard()

    expect(reloadForModuleNotFound(importUsersBuildA)).toBe(true)
    // Spent key, same document: still no error worth showing.
    expect(reloadForModuleNotFound(importUsersBuildA)).toBe(true)
  })

  test('stays waiting once the key it spent is gone', async () => {
    // The document is still on its way out; nothing that happens to storage
    // afterwards makes the error worth showing.
    const { reloadForModuleNotFound, clearModuleNotFoundReload } =
      await loadGuard()

    reloadForModuleNotFound(importUsersBuildA)
    clearModuleNotFoundReload(importUsersBuildA)

    expect(reloadForModuleNotFound(importPostsBuildA)).toBe(true)
  })

  test('surfaces the error in a document that never reloaded', async () => {
    // A key left by an earlier document is spent, and this one has no reload
    // in flight, so the error is real.
    const { reloadForModuleNotFound } = await loadGuard()
    sessionStorage.setItem(keyFor(importPostsBuildA), '1')

    expect(reloadForModuleNotFound(importPostsBuildA)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  test('degrades to not reloading when storage is refused', async () => {
    // A sandboxed iframe throws on access. Without storage there is no way to
    // detect a loop, so not reloading beats risking one.
    const { reloadForModuleNotFound } = await loadGuard()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('The operation is insecure.')
    })

    expect(reloadForModuleNotFound(importPostsBuildA)).toBe(false)
    expect(reload).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})

describe('clearModuleNotFoundReload', () => {
  test('returns the reload a recovered module spent', async () => {
    // Without this, a key that cannot change per build — a webpack chunk id —
    // would leave the module unable to reload for any later deployment.
    const { clearModuleNotFoundReload } = await loadGuard()
    sessionStorage.setItem(keyFor(requirePostsChunk), '1')

    clearModuleNotFoundReload(requirePostsChunk)

    expect(sessionStorage.getItem(keyFor(requirePostsChunk))).toBeNull()
  })

  test('leaves other modules alone, so a broken one cannot loop', async () => {
    // A module that is genuinely missing never loads, so its entry is never
    // cleared — least of all by a healthy route loading beside it.
    const { clearModuleNotFoundReload } = await loadGuard()
    sessionStorage.setItem(keyFor(requireUsersChunk), '1')

    clearModuleNotFoundReload(requirePostsChunk)

    expect(sessionStorage.getItem(keyFor(requireUsersChunk))).toBe('1')
  })

  test('is a no-op for a module that never reloaded', async () => {
    const { clearModuleNotFoundReload } = await loadGuard()

    expect(() => clearModuleNotFoundReload(importPostsBuildA)).not.toThrow()
    expect(sessionStorage.length).toBe(0)
  })
})
