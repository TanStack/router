import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import { Link, createRootRoute, createRoute, createRouter } from '../../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../../src/ssr/server'

test('preserves selected state props and styling during SSR', async () => {
  const active = vi.fn(() => ({
    class: 'selected',
    style: { color: 'blue' },
    title: 'selected',
  }))
  const unused = vi.fn(() => ({ class: 'unused' }))
  const root = createRootRoute({
    component: () => (
      <>
        <Link
          to="/"
          class="base"
          style={{ color: 'red', 'margin-top': '2px' }}
          activeProps={active}
          inactiveProps={unused}
        >
          Active
        </Link>
        <Link
          to="/other"
          activeProps={unused}
          inactiveProps={{ class: 'idle', 'data-state': 'idle' }}
        >
          Inactive
        </Link>
        <Link to="/">Default</Link>
        <Link to="/" activeProps={{}}>
          Empty
        </Link>
      </>
    ),
  })
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/' }),
    createRoute({ getParentRoute: () => root, path: '/other' }),
  ])
  const handler = createRequestHandler({
    request: new Request('http://localhost/'),
    createRouter: () => createRouter({ routeTree, isServer: true }),
  })
  const response = await handler(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: () => <RouterServer router={router} />,
    }),
  )
  const dom = new JSDOM(await response.text())
  try {
    const links = dom.window.document.querySelectorAll('a')
    expect(links).toHaveLength(4)
    expect([...links[0]!.classList]).toEqual(['base', 'selected'])
    expect(links[0]!.style.color).toBe('blue')
    expect(links[0]!.style.marginTop).toBe('2px')
    expect(links[0]!.getAttribute('title')).toBe('selected')
    expect([...links[1]!.classList]).toEqual(['idle'])
    expect(links[1]!.getAttribute('data-state')).toBe('idle')
    expect([...links[2]!.classList]).toEqual(['active'])
    expect([...links[3]!.classList]).toEqual([])
    expect(active).toHaveBeenCalled()
    expect(unused).not.toHaveBeenCalled()
  } finally {
    dom.window.close()
  }
})
