import * as Vue from 'vue'
import { afterEach, expect, test, vi } from 'vitest'
import { hydrate } from '@tanstack/router-core/ssr/client'
import {
  Link,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { createRequestHandler, renderRouterToString } from '../src/ssr/server'
import type { AnyRoute, LinkOptions } from '../src'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length) {
    cleanups.pop()!()
  }
  vi.restoreAllMocks()
  delete window.$_TSR
  document.body.innerHTML = ''
})

function makeRouter(
  isServer: boolean,
  url: string,
  component: AnyRoute['options']['component'],
) {
  const root = createRootRoute()
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component,
  })
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: [url] }),
    isServer,
    defaultHashScrollIntoView: false,
  })
  cleanups.push(() => router.history.destroy())
  return router
}

async function prepareHydration(
  component: AnyRoute['options']['component'],
  clientUrl = '/#details',
) {
  const response = await createRequestHandler({
    request: new Request('http://localhost/'),
    createRouter: () => makeRouter(true, '/', component),
  })(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      App: Vue.defineComponent({
        inheritAttrs: false,
        setup: () => () => (
          <html>
            <head />
            <body>
              <div id="app">
                <RouterProvider router={router} />
              </div>
            </body>
          </html>
        ),
      }),
    }),
  )
  expect(response.status).toBe(200)
  const serverDocument = new DOMParser().parseFromString(
    await response.text(),
    'text/html',
  )
  const container = document.createElement('div')
  container.innerHTML = serverDocument.getElementById('app')!.innerHTML
  document.body.appendChild(container)
  // Vitest's jsdom does not execute appended scripts. Evaluate only the public
  // SSR handler's bootstrap, supplying the browser's currentScript for cleanup.
  const currentScript = vi.spyOn(document, 'currentScript', 'get')
  try {
    for (const script of serverDocument.querySelectorAll('script')) {
      currentScript.mockReturnValue(script)
      new Function(script.textContent ?? '')()
    }
  } finally {
    currentScript.mockRestore()
  }
  const router = makeRouter(false, clientUrl, component)
  await hydrate(router)
  window.$_TSR!.h()
  const app = Vue.createSSRApp({
    setup: () => () => <RouterProvider router={router} />,
  })
  return {
    container,
    router,
    mount() {
      app.mount(container)
      cleanups.push(() => app.unmount())
    },
  }
}

test('hydrates a hash-sensitive Link against the server HTML before applying the client hash', async () => {
  const page = Vue.defineComponent({
    setup: () => () => (
      <Link to="/" hash="details" activeOptions={{ includeHash: true }}>
        {({ isActive }: { isActive: boolean }) => String(isActive)}
      </Link>
    ),
  })
  const { container, mount } = await prepareHydration(page)
  const anchor = container.querySelector('a')!
  expect(anchor.getAttribute('href')).toBe('/#details')
  expect(anchor.className).toBe('')
  expect(anchor.getAttribute('aria-current')).toBeNull()
  expect(anchor.textContent).toBe('false')

  const warn = vi.spyOn(console, 'warn')
  const error = vi.spyOn(console, 'error')
  mount()
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
  expect(container.querySelector('a')).toBe(anchor)
  expect(anchor.textContent).toBe('false')

  await Vue.nextTick()
  expect(anchor.className).toBe('active')
  expect(anchor.getAttribute('aria-current')).toBe('page')
  expect(anchor.textContent).toBe('true')
  expect(container.querySelector('a')).toBe(anchor)
})

test.each(['/#details', '/'])(
  'hydrates hashes at %s and follows hash/activeOptions changes',
  checkHashHydration,
)

async function checkHashHydration(clientUrl: string) {
  const includeHash = Vue.ref(true)
  const cases: Array<{
    id: string
    hash?: LinkOptions['hash']
    insensitive?: boolean
    server: [string, boolean]
    details: [string, boolean]
    other: [string, boolean]
  }> = [
    {
      id: 'matching',
      hash: 'details',
      server: ['/#details', false],
      details: ['/#details', true],
      other: ['/#details', false],
    },
    {
      id: 'nonmatching',
      hash: 'other',
      server: ['/#other', false],
      details: ['/#other', false],
      other: ['/#other', true],
    },
    {
      id: 'empty',
      hash: '',
      server: ['/', true],
      details: ['/', false],
      other: ['/', false],
    },
    {
      id: 'inherited',
      hash: true,
      server: ['/', true],
      details: ['/#details', true],
      other: ['/#other', true],
    },
    {
      id: 'function',
      hash: (previous = '') => `${previous}-child`,
      server: ['/#-child', false],
      details: ['/#details-child', false],
      other: ['/#other-child', false],
    },
    {
      id: 'inherited-insensitive',
      hash: true,
      insensitive: true,
      server: ['/', true],
      details: ['/#details', true],
      other: ['/#other', true],
    },
    {
      id: 'ordinary',
      insensitive: true,
      server: ['/', true],
      details: ['/', true],
      other: ['/', true],
    },
  ]
  const page = Vue.defineComponent({
    setup: () => () => (
      <nav>
        {cases.map(({ id, hash, insensitive }) => (
          <Link
            key={id}
            id={id}
            to="/"
            hash={hash}
            activeOptions={
              insensitive ? undefined : { includeHash: includeHash.value }
            }
            inactiveProps={{ class: 'inactive' }}
          >
            {({ isActive }: { isActive: boolean }) => String(isActive)}
          </Link>
        ))}
      </nav>
    ),
  })
  const { container, mount, router } = await prepareHydration(page, clientUrl)
  const anchors = Array.from(container.querySelectorAll('a'))
  function check(phase: 'server' | 'details' | 'other', ignoreHash = false) {
    for (const [index, entry] of cases.entries()) {
      const anchor = container.querySelector(`#${entry.id}`)!
      const [href, active] = entry[phase]
      const isActive = ignoreHash || active
      expect(anchor).toBe(anchors[index])
      expect(anchor.getAttribute('href')).toBe(href)
      expect(anchor.className).toBe(isActive ? 'active' : 'inactive')
      expect(anchor.getAttribute('aria-current')).toBe(isActive ? 'page' : null)
      expect(anchor.getAttribute('data-status')).toBe(
        isActive ? 'active' : null,
      )
      expect(anchor.textContent).toBe(String(isActive))
    }
  }
  check('server')
  const warn = vi.spyOn(console, 'warn')
  const error = vi.spyOn(console, 'error')
  mount()
  check('server')
  await Vue.nextTick()
  check(clientUrl === '/' ? 'server' : 'details')

  await router.navigate({ to: '/', hash: 'other' })
  await Vue.nextTick()
  check('other')
  includeHash.value = false
  await Vue.nextTick()
  check('other', true)
  includeHash.value = true
  await Vue.nextTick()
  check('other')
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
}

test('uses the live hash on the first render of a client-only mount', async () => {
  const renders: Array<boolean> = []
  const page = Vue.defineComponent({
    setup: () => () => (
      <nav>
        {(['details', true] as const).map((hash) => (
          <Link to="/" hash={hash} activeOptions={{ includeHash: true }}>
            {({ isActive }: { isActive: boolean }) => {
              renders.push(isActive)
              return String(isActive)
            }}
          </Link>
        ))}
      </nav>
    ),
  })
  const router = makeRouter(false, '/#details', page)
  await router.load()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = Vue.createApp({
    setup: () => () => <RouterProvider router={router} />,
  })
  app.mount(container)
  cleanups.push(() => app.unmount())
  expect(renders).toEqual([true, true])
  for (const anchor of container.querySelectorAll('a')) {
    expect(anchor.getAttribute('href')).toBe('/#details')
    expect(anchor.className).toBe('active')
    expect(anchor.getAttribute('aria-current')).toBe('page')
  }
  await Vue.nextTick()
  expect(renders.every(Boolean)).toBe(true)
})

test('new Links mounted after hydration use the live hash immediately', async () => {
  const show = Vue.ref(false)
  const renders: Array<boolean> = []
  const page = Vue.defineComponent({
    setup: () => () => (
      <div>
        {show.value && (
          <Link to="/" hash="details" activeOptions={{ includeHash: true }}>
            {({ isActive }: { isActive: boolean }) => {
              renders.push(isActive)
              return String(isActive)
            }}
          </Link>
        )}
      </div>
    ),
  })
  const { container, mount } = await prepareHydration(page)
  const warn = vi.spyOn(console, 'warn')
  const error = vi.spyOn(console, 'error')
  mount()
  await Vue.nextTick()
  show.value = true
  await Vue.nextTick()
  const anchor = container.querySelector('a')!
  expect(renders[0]).toBe(true)
  expect(anchor.getAttribute('href')).toBe('/#details')
  expect(anchor.className).toBe('active')
  expect(anchor.getAttribute('aria-current')).toBe('page')
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})
