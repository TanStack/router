import * as Vue from 'vue'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test.each(['replace', 'target', 'handler', 'style', 'attrs'] as const)(
  'a %s-only update preserves queued intent and current event semantics while observing stable updater evaluations',
  async (kind) => {
    const handlers: Array<string> = []
    const updaterReads: Array<number> = []
    const preloads: Array<number> = []
    const controls = Vue.reactive({
      replace: false,
      target: '_self',
      onClick: (_event: MouseEvent) => {
        handlers.push('old')
      },
      style: { color: 'red' },
      'data-label': 'first',
    })
    const search = (previous: { page: number }) => {
      updaterReads.push(previous.page)
      return { page: previous.page }
    }
    const root = createRootRoute({
      validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
      component: Vue.defineComponent({
        setup: () => () => (
          <>
            <Link
              to="/target"
              search={search}
              preload="intent"
              preloadDelay={50}
              {...controls}
            >
              control target
            </Link>
            <Outlet />
          </>
        ),
      }),
    })
    const source = createRoute({
      getParentRoute: () => root,
      path: '/source',
      component: () => <div>control source content</div>,
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target',
      beforeLoad: ({ search, preload }) => {
        if (preload) {
          preloads.push(search.page)
        }
      },
      component: () => <div>control target content</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([source, target]),
      history: createMemoryHistory({ initialEntries: ['/source?page=1'] }),
    })
    render(<RouterProvider router={router} />)
    await screen.findByText('control source content')
    const link = screen.getByRole('link', { name: 'control target' })
    expect(link).toHaveAttribute('href', '/target?page=1')
    const initialCalls = updaterReads.length
    let controlCalls: number
    let preloadCalls: number
    vi.useFakeTimers()
    try {
      await fireEvent.focus(link)
      if (kind === 'replace') {
        controls.replace = true
      } else if (kind === 'target') {
        controls.target = '_blank'
      } else if (kind === 'handler') {
        controls.onClick = (event) => {
          handlers.push('new')
          event.preventDefault()
        }
      } else if (kind === 'style') {
        controls.style = { color: 'blue' }
      } else {
        controls['data-label'] = 'second'
      }
      await Vue.nextTick()
      controlCalls = updaterReads.length
      expect(screen.getByRole('link', { name: 'control target' })).toBe(link)
      expect(link).toHaveAttribute('href', '/target?page=1')
      expect(router.state.location.href).toBe('/source?page=1')
      if (kind === 'style') {
        expect(link).toHaveStyle({ color: 'rgb(0, 0, 255)' })
      } else if (kind === 'attrs') {
        expect(link).toHaveAttribute('data-label', 'second')
      } else if (kind === 'target') {
        expect(link).toHaveAttribute('target', '_blank')
      }
      await vi.advanceTimersByTimeAsync(50)
      expect(preloads).toEqual([1])
      preloadCalls = updaterReads.length
    } finally {
      vi.useRealTimers()
    }
    const historyLength = router.history.length
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    })
    await fireEvent(link, click)
    if (kind === 'target' || kind === 'handler') {
      expect(router.state.location.href).toBe('/source?page=1')
      expect(router.history.length).toBe(historyLength)
      expect(click.defaultPrevented).toBe(kind === 'handler')
    } else {
      await screen.findByText('control target content')
      expect(router.state.location.href).toBe('/target?page=1')
      expect(router.history.length).toBe(
        historyLength + (kind === 'replace' ? 0 : 1),
      )
      expect(click.defaultPrevented).toBe(true)
    }
    expect(handlers).toEqual([kind === 'handler' ? 'new' : 'old'])
    expect(updaterReads.every((page) => page === 1)).toBe(true)
    // The baseline establishes counts before choosing an optimization contract.
    console.info(
      'Vue control-only updater evaluations',
      JSON.stringify({
        kind,
        initialCalls,
        controlCalls,
        preloadCalls,
        finalCalls: updaterReads.length,
      }),
    )
  },
)
