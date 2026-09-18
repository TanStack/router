import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { lazyRouteComponent } from '../src'

let reload: ReturnType<typeof vi.fn>
let originalLocation: Location

beforeEach(() => {
  sessionStorage.clear()
  reload = vi.fn()
  originalLocation = window.location
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...originalLocation, reload },
  })
})

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  })
  vi.restoreAllMocks()
})

const chunkError = () =>
  new TypeError(
    'Failed to fetch dynamically imported module: /assets/posts-BgDSEldj.js',
  )

// https://github.com/TanStack/router/issues/8377
test('#8377: renders after the reload is requested keep suspending instead of throwing', async () => {
  const Lazy = lazyRouteComponent(() => Promise.reject(chunkError())) as any

  await Lazy.preload()

  // First render arms the reload and suspends.
  let firstThrown: unknown
  try {
    Lazy({})
  } catch (thrown) {
    firstThrown = thrown
  }
  expect(firstThrown).toBeInstanceOf(Promise)
  expect(reload).toHaveBeenCalledTimes(1)

  // `location.reload()` is async, so React can render again before the
  // document goes away. That render must not fall through to `throw error`.
  let secondThrown: unknown
  try {
    Lazy({})
  } catch (thrown) {
    secondThrown = thrown
  }
  expect(secondThrown).toBeInstanceOf(Promise)
  expect(secondThrown).not.toBeInstanceOf(TypeError)

  // Still only the one reload — the sessionStorage guard is untouched.
  expect(reload).toHaveBeenCalledTimes(1)
})

// The guard exists to stop a reload loop when the chunk is missing for some
// reason other than a new deployment. A fresh document must still surface the
// error rather than suspending forever.
test('#8377: a later page load still throws once the guard is set', async () => {
  const error = chunkError()
  sessionStorage.setItem(`tanstack_router_reload:${error.message}`, '1')

  const Lazy = lazyRouteComponent(() => Promise.reject(error)) as any

  await Lazy.preload()

  expect(() => Lazy({})).toThrow(error)
  expect(reload).not.toHaveBeenCalled()
})
