import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  Link,
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLinkProps,
} from '../src'

const disposers: Array<() => void> = []
afterEach(() => {
  cleanup()
  for (const dispose of disposers.splice(0)) {
    dispose()
  }
})

test.each([
  { active: true, masked: false, server: false },
  { active: true, masked: true, server: false },
  { active: false, masked: false, server: false },
  { active: false, masked: true, server: false },
  { active: true, masked: false, server: true },
  { active: true, masked: true, server: true },
  { active: false, masked: false, server: true },
  { active: false, masked: true, server: true },
])(
  'state props preserve routing while disabled changes (active: $active, masked: $masked, server: $server)',
  async ({ active, masked, server }) => {
    const root = createRootRoute()
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '/active' }),
        createRoute({ getParentRoute: () => root, path: '/inactive' }),
      ]),
      history: createMemoryHistory({
        initialEntries: [active ? '/active' : '/inactive'],
      }),
      isServer: server,
    })
    disposers.push(router.history.destroy)
    await router.load()
    const stateProps = {
      className: 'state-class',
      href: 'javascript:active()',
      target: '_self',
      disabled: false,
    }
    const content = (disabled: boolean) => (
      <RouterContextProvider router={router}>
        <Link
          to="/active"
          mask={masked ? { to: '/masked' } : undefined}
          disabled={disabled}
          target="_blank"
          activeProps={stateProps}
          inactiveProps={stateProps}
        >
          Target
        </Link>
      </RouterContextProvider>
    )
    const view = server ? undefined : render(content(false))
    for (const disabled of [false, true, false]) {
      let anchor: HTMLElement
      if (view) {
        view.rerender(content(disabled))
        anchor = view.getByText('Target')
      } else {
        const container = document.createElement('div')
        container.innerHTML = renderToString(content(disabled))
        const link = container.querySelector('a')
        expect(link).not.toBeNull()
        if (!link) {
          throw new Error('Expected the server-rendered Link')
        }
        anchor = link
      }
      expect(anchor).toHaveClass('state-class')
      expect(anchor).toHaveAttribute('target', '_blank')
      if (active) {
        expect(anchor).toHaveAttribute('aria-current', 'page')
      } else {
        expect(anchor).not.toHaveAttribute('aria-current')
      }
      if (disabled) {
        expect(anchor).not.toHaveAttribute('href')
        expect(anchor).toHaveAttribute('aria-disabled', 'true')
      } else {
        expect(anchor).toHaveAttribute('href', masked ? '/masked' : '/active')
        expect(anchor).not.toHaveAttribute('aria-disabled')
      }
    }
  },
)

test.each([
  { active: true, server: false },
  { active: false, server: false },
  { active: true, server: true },
  { active: false, server: true },
])(
  'selected state props override base props (active: $active, server: $server)',
  async ({ active, server }) => {
    const baseClick = vi.fn()
    const selectedClick = vi.fn((event: React.MouseEvent) =>
      event.preventDefault(),
    )
    const unusedClick = vi.fn()
    const stateRef = React.createRef<HTMLAnchorElement>()
    let resolvedRef: React.Ref<HTMLAnchorElement> | undefined
    const stateProps = {
      ref: stateRef,
      title: 'state title',
      onClick: selectedClick,
      className: 'state-class',
      style: { color: 'blue' },
    }
    const history = createMemoryHistory({ initialEntries: ['/target'] })
    disposers.push(history.destroy)
    function TestLink() {
      const props = useLinkProps({
        to: active ? '/target' : '/',
        target: '_blank',
        title: 'base title',
        onClick: baseClick,
        className: 'base',
        style: { color: 'red', marginTop: 2 },
        activeProps: active ? stateProps : { onClick: unusedClick },
        inactiveProps: active ? { onClick: unusedClick } : stateProps,
        preload: false,
      })
      resolvedRef = props.ref
      return <a {...props}>Override</a>
    }
    const root = createRootRoute({ component: TestLink })
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '/' }),
        createRoute({ getParentRoute: () => root, path: '/target' }),
      ]),
      history,
      isServer: server,
      scrollRestoration: false,
    })

    let link: HTMLElement
    if (server) {
      await router.load()
      const container = document.createElement('div')
      container.innerHTML = renderToString(<RouterProvider router={router} />)
      const anchor = container.querySelector('a')
      expect(anchor).not.toBeNull()
      if (!anchor) {
        throw new Error('Expected the server-rendered Link')
      }
      link = anchor
    } else {
      render(<RouterProvider router={router} />)
      link = await screen.findByRole('link', { name: 'Override' })
    }

    expect(resolvedRef).toBe(stateRef)
    expect(link).toHaveAttribute('title', 'state title')
    expect(link).toHaveClass('base', 'state-class')
    expect(link.style).toMatchObject({ color: 'blue', marginTop: '2px' })
    if (!server) {
      fireEvent.click(link)
      expect(selectedClick).toHaveBeenCalledOnce()
      expect(baseClick).not.toHaveBeenCalled()
      expect(unusedClick).not.toHaveBeenCalled()
    }
  },
)
