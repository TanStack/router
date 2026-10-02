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
      id: 'omitted',
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
      id: 'identity',
      hash: (previous = '') => previous,
      server: ['/', true],
      details: ['/#details', true],
      other: ['/#other', true],
    },
    {
      id: 'function-insensitive',
      hash: (previous) => `${previous}-child`,
      insensitive: true,
      server: ['/#-child', true],
      details: ['/#details-child', true],
      other: ['/#other-child', true],
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

test.each([false, true])(
  'uses the live hash on the first render of a client-only mount (SSR options: %s)',
  async (ssr) => {
    const renders: Array<boolean> = []
    const hashInputs: Array<string> = []
    const inherit = (previous = '') => {
      hashInputs.push(previous)
      return previous
    }
    const page = Vue.defineComponent({
      setup: () => () => (
        <nav>
          {(['details', true, inherit] as const).map((hash) => (
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
    if (ssr) {
      router.options.ssr = {}
    }
    await router.load()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = Vue.createApp({
      setup: () => () => <RouterProvider router={router} />,
    })
    app.mount(container)
    cleanups.push(() => app.unmount())
    expect(renders).toEqual([true, true, true])
    expect(hashInputs[0]).toBe('details')
    for (const anchor of container.querySelectorAll('a')) {
      expect(anchor.getAttribute('href')).toBe('/#details')
      expect(anchor.className).toBe('active')
      expect(anchor.getAttribute('aria-current')).toBe('page')
    }
    await Vue.nextTick()
    expect(renders.every(Boolean)).toBe(true)
  },
)

test('new Links mounted after hydration use the live hash immediately', async () => {
  const show = Vue.ref(false)
  const renders: Array<boolean> = []
  const hashInputs: Array<string> = []
  const page = Vue.defineComponent({
    setup: () => () => (
      <div>
        {show.value && (
          <Link
            to="/"
            hash={(previous = '') => {
              hashInputs.push(previous)
              return previous
            }}
            activeOptions={{ includeHash: true }}
          >
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
  expect(hashInputs[0]).toBe('details')
  expect(anchor.getAttribute('href')).toBe('/#details')
  expect(anchor.className).toBe('active')
  expect(anchor.getAttribute('aria-current')).toBe('page')
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})

test('hydration only rebuilds destinations that depend on the current hash', async () => {
  const page = Vue.defineComponent({
    setup: () => () => (
      <nav>
        <Link id="ordinary" to="/">
          ordinary
        </Link>
        <Link
          id="literal"
          to="/"
          hash="details"
          activeOptions={{ includeHash: true }}
        >
          literal
        </Link>
        <Link id="inherited" to="/" hash={true}>
          inherited
        </Link>
      </nav>
    ),
  })
  const { router, mount, container } = await prepareHydration(page)
  const build = vi.spyOn(router, 'buildLocation')
  const count = (id: string) =>
    build.mock.calls.filter(
      ([options]) => (options as { id?: string }).id === id,
    ).length
  mount()
  const initial = ['ordinary', 'literal', 'inherited'].map(count)
  expect(initial.every((calls) => calls > 0)).toBe(true)
  await Vue.nextTick()
  expect(count('ordinary')).toBe(initial[0])
  expect(count('literal')).toBe(initial[1])
  expect(count('inherited')).toBeGreaterThan(initial[2]!)
  expect(container.querySelector('#literal')).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(container.querySelector('#inherited')).toHaveAttribute(
    'href',
    '/#details',
  )
})

test('hash options stay reactive when an ordinary link becomes hash-dependent', async () => {
  const hash = Vue.ref<LinkOptions['hash']>()
  const activeOptions = Vue.reactive({ includeHash: false })
  const page = Vue.defineComponent({
    setup: () => () => (
      <Link to="/" hash={hash.value} activeOptions={activeOptions}>
        {({ isActive }: { isActive: boolean }) => String(isActive)}
      </Link>
    ),
  })
  const { container, mount } = await prepareHydration(page)
  const anchor = container.querySelector('a')!
  mount()
  await Vue.nextTick()
  for (const [nextHash, includeHash, href, active] of [
    [undefined, true, '/', false],
    [true, true, '/#details', true],
    [(previous = '') => `${previous}-child`, true, '/#details-child', false],
    ['other', false, '/#other', true],
    [undefined, false, '/', true],
  ] satisfies Array<[LinkOptions['hash'], boolean, string, boolean]>) {
    hash.value = nextHash
    activeOptions.includeHash = includeHash
    await Vue.nextTick()
    expect(container.querySelector('a')).toBe(anchor)
    expect(anchor).toHaveAttribute('href', href)
    expect(anchor.textContent).toBe(String(active))
  }
})

test.each(['inherit', 'function', 'href'] as const)(
  'preserves explicit source/href precedence during hydration (%s)',
  async (kind) => {
    const source = makeRouter(true, '/#preset', undefined).stores.location.get()
    const updater = vi.fn((previous = '') => `${previous}-child`)
    const page = Vue.defineComponent({
      setup: () => () => (
        <Link
          to="/"
          hash={kind === 'inherit' ? true : updater}
          href={kind === 'href' ? '/#fixed' : undefined}
          _fromLocation={kind === 'href' ? undefined : source}
          activeOptions={{ includeHash: true }}
        >
          {({ isActive }: { isActive: boolean }) => String(isActive)}
        </Link>
      ),
    })
    const { container, mount } = await prepareHydration(page)
    const anchor = container.querySelector('a')!
    const href =
      kind === 'href'
        ? '/#fixed'
        : kind === 'inherit'
          ? '/#preset'
          : '/#preset-child'
    expect(anchor).toHaveAttribute('href', href)
    expect(anchor.textContent).toBe('false')
    const warn = vi.spyOn(console, 'warn')
    const error = vi.spyOn(console, 'error')
    mount()
    await Vue.nextTick()
    expect(container.querySelector('a')).toBe(anchor)
    expect(anchor).toHaveAttribute('href', href)
    expect(anchor.textContent).toBe('false')
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    if (kind === 'href') {
      expect(updater).not.toHaveBeenCalled()
    } else if (kind === 'function') {
      expect(updater).toHaveBeenCalledWith('preset')
      expect(updater).not.toHaveBeenCalledWith('')
    }
  },
)
