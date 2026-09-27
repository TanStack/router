import React from 'react'
import { renderToString } from 'react-dom/server'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { act } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'
import type { LinkOptions } from '../src'

const cleanups: Array<() => void> = []

afterEach(async () => {
  await act(() => {
    while (cleanups.length) {
      cleanups.pop()!()
    }
  })
  vi.restoreAllMocks()
})

function makeRouter(isServer: boolean, url: string) {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: [url] }),
    isServer,
    ssr: {},
    defaultHashScrollIntoView: false,
  })
  cleanups.push(() => router.history.destroy())
  return router
}

const cases: Array<{
  name: string
  hash?: LinkOptions['hash']
  href?: string
  sourceHash?: string
  includeHash?: boolean
  server: [string, boolean]
  client: [string, boolean]
}> = [
  {
    name: 'explicit-source',
    hash: true,
    sourceHash: 'preset',
    includeHash: true,
    server: ['/#preset', false],
    client: ['/#preset', false],
  },
  {
    name: 'explicit-source-function',
    hash: (hash = '') => `${hash}-child`,
    sourceHash: 'preset',
    includeHash: true,
    server: ['/#preset-child', false],
    client: ['/#preset-child', false],
  },
  {
    name: 'explicit-href',
    href: '/#fixed',
    hash: () => {
      throw new Error('href overrides hash')
    },
    includeHash: true,
    server: ['/#fixed', false],
    client: ['/#fixed', false],
  },
  {
    name: 'matching',
    hash: 'details',
    includeHash: true,
    server: ['/#details', false],
    client: ['/#details', true],
  },
  {
    name: 'nonmatching',
    hash: 'other',
    includeHash: true,
    server: ['/#other', false],
    client: ['/#other', false],
  },
  {
    name: 'empty',
    hash: '',
    includeHash: true,
    server: ['/', true],
    client: ['/', false],
  },
  {
    name: 'omitted',
    includeHash: true,
    server: ['/', true],
    client: ['/', false],
  },
  {
    name: 'inherited',
    hash: true,
    includeHash: true,
    server: ['/', true],
    client: ['/#details', true],
  },
  {
    name: 'identity',
    hash: (hash = '') => hash,
    includeHash: true,
    server: ['/', true],
    client: ['/#details', true],
  },
  {
    name: 'derived',
    hash: (hash) => `${hash}-child`,
    includeHash: true,
    server: ['/#-child', false],
    client: ['/#details-child', false],
  },
  {
    name: 'inherited-insensitive',
    hash: true,
    server: ['/', true],
    client: ['/#details', true],
  },
  {
    name: 'derived-insensitive',
    hash: (hash) => `${hash}-child`,
    server: ['/#-child', true],
    client: ['/#details-child', true],
  },
  { name: 'ordinary', server: ['/', true], client: ['/', true] },
]

test.each(
  cases.flatMap((entry) =>
    ['/', '/#details'].map((url) => ({ ...entry, url })),
  ),
)(
  'hydrates $name links at $url without changing server DOM during hydration',
  async (entry) => {
    const renders: Array<boolean> = []
    const source = entry.sourceHash
      ? makeRouter(true, `/#${entry.sourceHash}`).stores.location.get()
      : undefined
    const link = (
      <Link
        to="/"
        hash={entry.hash}
        href={entry.href}
        _fromLocation={source}
        activeOptions={{ includeHash: entry.includeHash }}
        inactiveProps={{ className: 'inactive' }}
      >
        {({ isActive }) => {
          renders.push(isActive)
          return String(isActive)
        }}
      </Link>
    )
    const container = document.createElement('div')
    const server = makeRouter(true, '/')
    container.innerHTML = renderToString(
      <RouterContextProvider router={server}>{link}</RouterContextProvider>,
    )
    const anchor = container.querySelector('a')!
    function check([href, active]: [string, boolean]) {
      expect(container.querySelector('a')).toBe(anchor)
      expect(anchor.getAttribute('href')).toBe(href)
      expect(anchor.className).toBe(active ? 'active' : 'inactive')
      expect(anchor.getAttribute('aria-current')).toBe(active ? 'page' : null)
      expect(anchor.getAttribute('data-status')).toBe(active ? 'active' : null)
      expect(anchor.textContent).toBe(String(active))
    }
    check(entry.server)
    renders.length = 0
    const client = makeRouter(false, entry.url)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const recoverable = vi.fn()
    await act(() => {
      const root = hydrateRoot(
        container,
        <RouterContextProvider router={client}>{link}</RouterContextProvider>,
        { onRecoverableError: recoverable },
      )
      cleanups.push(() => root.unmount())
    })
    expect(renders[0]).toBe(entry.server[1])
    check(entry.url === '/' ? entry.server : entry.client)
    expect(client.stores.location.get().hash).toBe(
      entry.url === '/' ? '' : 'details',
    )
    expect(error).not.toHaveBeenCalled()
    expect(recoverable).not.toHaveBeenCalled()
    if (entry.name === 'ordinary') {
      expect(renders).toEqual([true])
    }

    await act(() => client.navigate({ to: '/', hash: 'other' }))
    expect(container.querySelector('a')).toBe(anchor)
    const inheritsHash = entry.hash === true || typeof entry.hash === 'function'
    check([
      inheritsHash
        ? entry.client[0].replace('details', 'other')
        : entry.client[0],
      !entry.includeHash ||
        ['nonmatching', 'inherited', 'identity'].includes(entry.name),
    ])
    await act(() => client.navigate({ to: '/', hash: '' }))
    check(entry.server)
  },
)

test.each(
  [false, true].flatMap((later) => [
    {
      later,
      hash: 'details' as LinkOptions['hash'],
      href: '/#details',
      active: true,
    },
    { later, hash: true as const, href: '/#details', active: true },
    {
      later,
      hash: (hash = '') => `${hash}-child`,
      href: '/#details-child',
      active: false,
    },
  ]),
)(
  'uses live hashes on the first client-only render ($href, later mount: $later)',
  async ({ later, hash, href, active }) => {
    const router = makeRouter(false, '/#details')
    const renders: Array<{ href?: string; active: boolean }> = []
    const ObservedLink = createLink(
      React.forwardRef<HTMLAnchorElement, React.ComponentProps<'a'>>(
        (props, ref) => {
          renders.push({
            href: props.href,
            active: props['aria-current'] === 'page',
          })
          return <a {...props} ref={ref} />
        },
      ),
    )
    const container = document.createElement('div')
    const tree = (show: boolean) => (
      <RouterContextProvider router={router}>
        {show && (
          <ObservedLink
            to="/"
            hash={hash}
            activeOptions={{ includeHash: true }}
          >
            {({ isActive }) => String(isActive)}
          </ObservedLink>
        )}
      </RouterContextProvider>
    )
    let root: ReturnType<typeof createRoot>
    await act(() => {
      if (later) {
        container.innerHTML = renderToString(tree(false))
        root = hydrateRoot(container, tree(false))
      } else {
        root = createRoot(container)
      }
      cleanups.push(() => root.unmount())
    })
    await act(() => root.render(tree(true)))
    expect(renders[0]).toEqual({ href, active })
    expect(container.querySelector('a')).toHaveAttribute('href', href)
  },
)

test('hash-dependent links share current-route validation while hydrating', async () => {
  const validateSearch = vi.fn((search: Record<string, unknown>) => search)
  const make = (isServer: boolean, url: string) => {
    const router = createRouter({
      routeTree: createRootRoute({ validateSearch }),
      history: createMemoryHistory({ initialEntries: [url] }),
      isServer,
    })
    cleanups.push(() => router.history.destroy())
    return router
  }
  const links = Array.from({ length: 10 }, (_, index) => (
    <Link key={index} to="." search={true} hash={true}>
      Link
    </Link>
  ))
  const container = document.createElement('div')
  container.innerHTML = renderToString(
    <RouterContextProvider router={make(true, '/?q=test')}>
      {links}
    </RouterContextProvider>,
  )
  const client = make(false, '/?q=test#details')
  validateSearch.mockClear()
  await act(() => {
    const root = hydrateRoot(
      container,
      <RouterContextProvider router={client}>{links}</RouterContextProvider>,
    )
    cleanups.push(() => root.unmount())
  })
  expect(validateSearch).toHaveBeenCalledTimes(1)
  expect(container.querySelectorAll('a')).toHaveLength(10)
  for (const anchor of container.querySelectorAll('a')) {
    expect(anchor).toHaveAttribute('href', '/?q=test#details')
  }
})

test('updates hash and active options on the same hydrated link', async () => {
  const tree = (
    router: ReturnType<typeof makeRouter>,
    hash?: LinkOptions['hash'],
    includeHash = false,
  ) => (
    <RouterContextProvider router={router}>
      <Link to="/" hash={hash} activeOptions={{ includeHash }}>
        {({ isActive }) => String(isActive)}
      </Link>
    </RouterContextProvider>
  )
  const container = document.createElement('div')
  container.innerHTML = renderToString(tree(makeRouter(true, '/')))
  const anchor = container.querySelector('a')!
  const router = makeRouter(false, '/#details')
  let root: ReturnType<typeof hydrateRoot>
  await act(() => {
    root = hydrateRoot(container, tree(router))
    cleanups.push(() => root.unmount())
  })
  for (const [hash, includeHash, href, active] of [
    [undefined, true, '/', false],
    [true, true, '/#details', true],
    [(previous = '') => `${previous}-child`, true, '/#details-child', false],
    ['other', false, '/#other', true],
    [undefined, false, '/', true],
  ] satisfies Array<[LinkOptions['hash'], boolean, string, boolean]>) {
    await act(() => root.render(tree(router, hash, includeHash)))
    expect(container.querySelector('a')).toBe(anchor)
    expect(anchor).toHaveAttribute('href', href)
    expect(anchor.textContent).toBe(String(active))
  }
})

test('updates and removes an explicit href before using the hash updater', async () => {
  const hash = vi.fn((previous = '') => `${previous}-child`)
  const tree = (router: ReturnType<typeof makeRouter>, href?: string) => (
    <RouterContextProvider router={router}>
      <Link to="/" href={href} hash={hash}>
        Link
      </Link>
    </RouterContextProvider>
  )
  const container = document.createElement('div')
  container.innerHTML = renderToString(tree(makeRouter(true, '/'), '/#one'))
  const anchor = container.querySelector('a')!
  const router = makeRouter(false, '/#details')
  let root: ReturnType<typeof hydrateRoot>
  await act(() => {
    root = hydrateRoot(container, tree(router, '/#one'))
    cleanups.push(() => root.unmount())
  })
  await act(() => root.render(tree(router, '/#two')))
  expect(anchor).toHaveAttribute('href', '/#two')
  expect(hash).not.toHaveBeenCalled()
  await act(() => root.render(tree(router)))
  expect(container.querySelector('a')).toBe(anchor)
  expect(anchor).toHaveAttribute('href', '/#details-child')
  expect(hash).toHaveBeenCalledWith('details')
})
