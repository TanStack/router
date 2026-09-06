import { afterEach, expect, test, vi } from 'vitest'
import { lazyRouteComponent } from '../src/lazyRouteComponent'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

test.each(['named', 'message fallback'])(
  'reloads a missing Webpack chunk once at render time (%s)',
  async (kind) => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    const error = new Error('Loading chunk 123 failed.\n(error: /123.old.js)')
    if (kind === 'named') {
      error.name = 'ChunkLoadError'
      error.message = 'The requested chunk is unavailable'
    }
    const importer = vi
      .fn<() => Promise<{ default: () => null }>>()
      .mockRejectedValue(error)
    const Page = lazyRouteComponent(importer)

    await expect(Page.preload?.()).resolves.toBeUndefined()
    expect(reload).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)

    // React suspends while the document reloads.
    expect(() => Page({})).toThrow(Promise)
    expect(reload).toHaveBeenCalledOnce()

    // A new module instance after reload still sees the previous attempt.
    const AfterReload = lazyRouteComponent(importer)
    await AfterReload.preload?.()
    expect(() => AfterReload({})).toThrow(error)
    expect(reload).toHaveBeenCalledOnce()
  },
)

test('an unrelated chunk message reaches the error boundary without a reload', async () => {
  const reload = vi.fn()
  vi.stubGlobal('window', { location: { reload } })
  const error = new Error('Loading chunk metadata is unavailable')
  const importer = vi
    .fn<() => Promise<{ default: () => null }>>()
    .mockRejectedValue(error)
  const Page = lazyRouteComponent(importer)

  await Page.preload?.()
  expect(() => Page({})).toThrow(error)
  expect(reload).not.toHaveBeenCalled()
  expect(sessionStorage.length).toBe(0)
})
