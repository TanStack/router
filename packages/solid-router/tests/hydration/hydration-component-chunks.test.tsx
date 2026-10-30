import { sharedConfig } from 'solid-js'
import { hydrate as hydrateDom } from 'solid-js/web'
import { hydrate as hydrateRouter } from '@tanstack/router-core/ssr/client'
import { afterEach, describe, expect, inject, test, vi } from 'vitest'
import { RouterProvider, createLazyRoute, lazyRouteComponent } from '../../src'
import { Page, makeRouter } from './routes'
import type { TsrSsrGlobal } from '@tanstack/router-core/ssr/client'

declare global {
  interface Window {
    $_TSR?: TsrSsrGlobal
  }
  // eslint-disable-next-line no-var
  var _$HY: unknown
}

const testCleanups: Array<() => void> = []

afterEach(() => {
  while (testCleanups.length) {
    testCleanups.pop()!()
  }
  vi.restoreAllMocks()
  window.$_TSR = undefined
  globalThis._$HY = undefined
  // A delegated event ends hydration for the whole module.
  sharedConfig.done = false
  document.body.innerHTML = ''
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function bootstrap() {
  window.$_TSR = {
    router: {
      manifest: { routes: {} },
      dehydratedData: {},
      matches: inject('serverMatches'),
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
    initialized: false,
  } as unknown as TsrSsrGlobal
  globalThis._$HY = { events: [], completed: new WeakSet(), r: {}, fe() {} }
}

function settleWithin(promise: Promise<void>, ms: number) {
  return Promise.race([
    promise.then(() => 'hydrated' as const),
    new Promise<'waiting'>((resolve) =>
      setTimeout(() => resolve('waiting'), ms),
    ),
  ])
}

const withoutComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')

function hydrateDocument(router: ReturnType<typeof makeRouter>) {
  const container = document.createElement('div')
  container.innerHTML = inject('serverHtml')
  document.body.appendChild(container)
  const consoleError = vi.spyOn(console, 'error')
  const consoleWarn = vi.spyOn(console, 'warn')
  testCleanups.push(
    hydrateDom(() => <RouterProvider router={router} />, container),
  )
  return {
    container,
    logs: () =>
      [consoleError.mock.calls, consoleWarn.mock.calls].flat(2).join(' '),
  }
}

describe('hydrating with route chunks still downloading', () => {
  test('keeps the server HTML while a code-split component chunk downloads', async () => {
    bootstrap()
    const pageModule = deferred<{ default: typeof Page }>()
    const router = makeRouter(
      (route) => route,
      lazyRouteComponent(() => pageModule.promise),
    )

    expect(await settleWithin(hydrateRouter(router), 50)).toBe('hydrated')

    const { container, logs } = hydrateDocument(router)
    const header = container.querySelector('header')
    const main = container.querySelector('main')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(withoutComments(container.innerHTML)).toBe(
      withoutComments(inject('serverHtml')),
    )

    pageModule.resolve({ default: Page })
    await pageModule.promise
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.querySelector('header')).toBe(header)
    expect(container.querySelector('main')).toBe(main)
    expect(logs()).toBe('')

    container.querySelector('button')!.click()
    expect(container.querySelector('button')).toHaveTextContent('1')
  })

  test('waits only for lazy route options, not the component chunk they name', async () => {
    bootstrap()
    const lazyOptions =
      deferred<ReturnType<ReturnType<typeof createLazyRoute>>>()
    const pageModule = deferred<{ default: typeof Page }>()
    const router = makeRouter((route) => route.lazy(() => lazyOptions.promise))

    const hydration = hydrateRouter(router)
    expect(await settleWithin(hydration, 50)).toBe('waiting')

    lazyOptions.resolve(
      createLazyRoute('/page')({
        component: lazyRouteComponent(() => pageModule.promise),
      }),
    )
    expect(await settleWithin(hydration, 50)).toBe('hydrated')

    const { container, logs } = hydrateDocument(router)
    const main = container.querySelector('main')
    pageModule.resolve({ default: Page })
    await pageModule.promise
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.querySelector('main')).toBe(main)
    expect(logs()).toBe('')
  })

  test('renders the component when an event ends hydration before its chunk arrives', async () => {
    bootstrap()
    const pageModule = deferred<{ default: typeof Page }>()
    const router = makeRouter(
      (route) => route,
      lazyRouteComponent(() => pageModule.promise),
    )
    await hydrateRouter(router)

    const { container, logs } = hydrateDocument(router)
    container.querySelector('header')!.click()
    pageModule.resolve({ default: Page })
    await pageModule.promise
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(container.querySelector('main')).toHaveTextContent('Page body0')
    container.querySelector('button')!.click()
    expect(container.querySelector('button')).toHaveTextContent('1')
    expect(logs()).toBe('')
  })
})
