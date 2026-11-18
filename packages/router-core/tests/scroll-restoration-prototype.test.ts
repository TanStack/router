import { createMemoryHistory } from '@tanstack/history'
import { expect, test, vi } from 'vitest'
import { storageKey } from '../src'

// Include cache reload and invalid-storage recovery, which initialize separate maps.
test.each([undefined, '{', '{"saved":{"window":{"scrollX":0,"scrollY":42}}}'])(
  'URL-derived scroll keys stay isolated with initial storage %s',
  async (stored) => {
    vi.resetModules()
    sessionStorage.clear()
    if (stored !== undefined) {
      sessionStorage.setItem(storageKey, stored)
    }
    const { BaseRootRoute, BaseRoute, getElementScrollRestorationEntry } =
      await import('../src')
    const { createTestRouter } = await import('./routerTestUtils')
    const windowListeners = vi.spyOn(window, 'addEventListener')
    const documentListeners = vi.spyOn(document, 'addEventListener')
    const root = new BaseRootRoute()
    const index = new BaseRoute({ getParentRoute: () => root, path: '/' })
    const router = createTestRouter({
      routeTree: root.addChildren([index]),
      history: createMemoryHistory({ initialEntries: ['/?room=other'] }),
      scrollRestoration: true,
      getScrollRestorationKey: (location) =>
        String((location.search as Record<string, unknown>).room),
    })
    const getEntry = () =>
      getElementScrollRestorationEntry(router, {
        getElement: () => window,
        getKey: (location) =>
          String((location.search as Record<string, unknown>).room),
      })
    const targets = [Object.prototype, Object, Object.prototype.toString]
    const originals = targets.map((target) =>
      Object.getOwnPropertyDescriptor(target, 'window'),
    )
    vi.stubGlobal('scrollX', 0)
    vi.stubGlobal('scrollY', 120)

    try {
      await router.load()
      for (const room of ['__proto__', 'constructor', 'toString']) {
        await router.navigate({ to: '/', search: { room } })
        expect(getEntry()).toBeUndefined()
        document.dispatchEvent(new Event('scroll'))
        await router.navigate({ to: '/', search: { room: 'other' } })

        expect(({} as Record<string, unknown>).window).toBeUndefined()
        for (let i = 0; i < targets.length; i++) {
          expect(Object.getOwnPropertyDescriptor(targets[i], 'window')).toEqual(
            originals[i],
          )
        }
        expect(getEntry()).toBeUndefined()
        await router.navigate({ to: '/', search: { room } })
        expect(getEntry()).toEqual({ scrollX: 0, scrollY: 120 })
      }
      window.dispatchEvent(new Event('pagehide'))
      vi.resetModules()
      const { getElementScrollRestorationEntry: restoredEntry } =
        await import('../src')
      for (const room of ['__proto__', 'constructor', 'toString']) {
        await router.navigate({ to: '/', search: { room } })
        expect(
          restoredEntry(router, {
            getElement: () => window,
            getKey: () => room,
          }),
        ).toEqual({ scrollX: 0, scrollY: 120 })
      }
      if (stored?.includes('saved')) {
        await router.navigate({ to: '/', search: { room: 'saved' } })
        expect(getEntry()).toEqual({ scrollX: 0, scrollY: 42 })
      }
    } finally {
      // A failing regression must not leak the vulnerable version's write.
      targets.forEach((target, index) => {
        const original = originals[index]
        if (original) {
          Object.defineProperty(target, 'window', original)
        } else {
          Reflect.deleteProperty(target, 'window')
        }
      })
      for (const args of windowListeners.mock.calls) {
        window.removeEventListener(...args)
      }
      for (const args of documentListeners.mock.calls) {
        document.removeEventListener(...args)
      }
      router.history.destroy()
      sessionStorage.clear()
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    }
  },
)
