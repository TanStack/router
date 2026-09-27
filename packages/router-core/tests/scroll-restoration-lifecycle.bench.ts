import { createMemoryHistory } from '@tanstack/history'
import { bench, expect, vi } from 'vitest'
import { BaseRootRoute, getElementScrollRestorationEntry } from '../src'
import { createTestRouter } from './routerTestUtils'

// Measure the changed lifecycle directly; navigation benches never unload.
for (const count of [0, 1, 32]) {
  let cleanup: () => void
  const hide = new PageTransitionEvent('pagehide', { persisted: true })
  const show = new PageTransitionEvent('pageshow', { persisted: true })
  bench(
    `scroll lifecycle with ${count} nested targets`,
    () => {
      for (let i = 0; i < 100; i++) {
        dispatchEvent(hide)
        dispatchEvent(show)
      }
    },
    {
      time: 1000,
      warmupTime: 200,
      setup: () => {
        const remove: Array<() => void> = []
        for (const target of [window, document]) {
          const add = target.addEventListener.bind(target)
          vi.spyOn(target, 'addEventListener').mockImplementation(
            (type, listener, options) => {
              add(type, listener, options)
              remove.push(() =>
                target.removeEventListener(type, listener, options),
              )
            },
          )
        }
        const router = createTestRouter({
          routeTree: new BaseRootRoute({}),
          history: createMemoryHistory(),
          scrollRestoration: true,
          getScrollRestorationKey: () => `lifecycle-bench-${count}`,
        })
        expect(history.scrollRestoration).toBe('manual')
        for (let i = 0; i < count; i++) {
          const element = document.createElement('div')
          element.dataset.scrollRestorationId = `bench-${i}`
          document.body.append(element)
          element.scrollTop = 80 + i
          element.dispatchEvent(new Event('scroll', { bubbles: true }))
        }
        dispatchEvent(hide)
        for (let i = 0; i < count; i++) {
          expect(
            getElementScrollRestorationEntry(router, {
              id: `bench-${i}`,
              getKey: router.options.getScrollRestorationKey,
            }),
          ).toEqual({ scrollX: 0, scrollY: 80 + i })
        }
        vi.restoreAllMocks()
        cleanup = () => {
          for (const dispose of remove) {
            dispose()
          }
          router.history.destroy()
          document.body.replaceChildren()
        }
      },
      teardown: () => cleanup(),
    },
  )
}
