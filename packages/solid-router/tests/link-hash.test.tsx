import { cleanup, render } from '@solidjs/testing-library'
import { afterEach, expect, test } from 'vitest'
import { createSignal } from 'solid-js'
import {
  Link,
  RouterContextProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'
import type { ComponentProps } from 'solid-js'
import type { LinkOptions } from '../src'

afterEach(cleanup)

test.each([
  { hash: 'details' as LinkOptions['hash'], href: '/#details', active: true },
  { hash: true as const, href: '/#details', active: true },
  {
    hash: (previous = '') => `${previous}-child`,
    href: '/#details-child',
    active: false,
  },
])(
  'client-only links on an SSR router use the live hash on their first render ($href)',
  ({ hash, href, active }) => {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({ initialEntries: ['/#details'] }),
      isServer: false,
      ssr: {},
    })
    const renders: Array<{ href?: string; active: boolean }> = []
    const ObservedLink = createLink((props: ComponentProps<'a'>) => {
      renders.push({
        href: props.href,
        active: props['aria-current'] === 'page',
      })
      return <a {...props} />
    })
    const { container } = render(() => (
      <RouterContextProvider router={router}>
        {() => (
          <ObservedLink
            to="/"
            hash={hash}
            activeOptions={{ includeHash: true }}
          >
            {({ isActive }) => String(isActive)}
          </ObservedLink>
        )}
      </RouterContextProvider>
    ))
    expect(renders[0]).toEqual({ href, active })
    expect(container.querySelector('a')).toHaveAttribute('href', href)
    router.history.destroy()
  },
)

test('hash and active options stay reactive on an initially ordinary link', () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/#details'] }),
  })
  const [hash, setHash] = createSignal<LinkOptions['hash']>()
  const [includeHash, setIncludeHash] = createSignal(false)
  const { container } = render(() => (
    <RouterContextProvider router={router}>
      {() => (
        <Link
          to="/"
          hash={hash()}
          activeOptions={{ includeHash: includeHash() }}
        >
          {({ isActive }) => String(isActive)}
        </Link>
      )}
    </RouterContextProvider>
  ))
  const anchor = container.querySelector('a')!
  for (const [nextHash, include, href, active] of [
    [undefined, true, '/', false],
    [true, true, '/#details', true],
    [(previous = '') => `${previous}-child`, true, '/#details-child', false],
    ['other', false, '/#other', true],
    [undefined, false, '/', true],
  ] satisfies Array<[LinkOptions['hash'], boolean, string, boolean]>) {
    setHash(() => nextHash)
    setIncludeHash(include)
    expect(container.querySelector('a')).toBe(anchor)
    expect(anchor).toHaveAttribute('href', href)
    expect(anchor.textContent).toBe(String(active))
  }
  router.history.destroy()
})
