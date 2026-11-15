import { renderToString } from '@solidjs/web'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../../src'
import { linkHrefCases } from '../link-href-cases'

afterEach(() => vi.restoreAllMocks())

// The v2 provider loads the router, which rejects a rewrite to a blocked protocol.
const cases = linkHrefCases.filter(
  ([kind, , blocked]) => !(kind === 'rewrite' && blocked),
)

test.each(cases)(
  'validates SSR %s href %j and its active state',
  async (kind, href, blocked, active) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const history = createMemoryHistory({ initialEntries: ['/safe'] })
    history.createHref = vi.fn((path) => (kind === 'history' ? href : path))
    const router = createRouter({
      routeTree: createRootRoute(),
      history,
      isServer: true,
      protocolAllowlist: ['http:', 'https:', 'myapp:'],
      rewrite:
        kind === 'rewrite'
          ? {
              output: ({ url }) => new URL(href, url),
            }
          : undefined,
    })
    const activeProps = { class: 'active', href: 'javascript:active()' }
    const inactiveProps = { class: 'inactive', href: 'javascript:inactive()' }
    // The v2 provider parks a server render on the router load.
    await router.load()
    const html = renderToString(() => (
      <RouterContextProvider router={router}>
        {() => (
          <Link
            to={kind === 'to' ? href : '/safe'}
            activeProps={activeProps}
            inactiveProps={inactiveProps}
          >
            {({ isActive }) => String(isActive)}
          </Link>
        )}
      </RouterContextProvider>
    ))
    if (kind === 'history') {
      expect(history.createHref).toHaveBeenCalledWith('/safe')
    }
    expect(html.match(/href="([^"]*)"/)?.[1] ?? null).toBe(
      blocked ? null : href,
    )
    expect(
      html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/<[^>]*>/g, ''),
    ).toBe(String(active))
    expect(html.match(/class="([^"]*)"/)?.[1]?.trim()).toBe(
      active ? 'active' : 'inactive',
    )
    expect(html.includes('aria-current="page"')).toBe(active)
    expect(html.includes('aria-disabled="true"')).toBe(blocked)
  },
)
