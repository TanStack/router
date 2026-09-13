import React from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('blocked custom links keep the validated props and forwarded ref', () => {
  const CustomLink = createLink(
    React.forwardRef<
      HTMLAnchorElement,
      React.ComponentProps<'a'> & { disabled?: boolean }
    >((props, ref) => (
      <a {...props} data-disabled={String(props.disabled)} ref={ref} />
    )),
  )
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory(),
  })
  const ref = React.createRef<HTMLAnchorElement>()
  const unwantedRef = vi.fn()
  const search = vi.fn(() => ({}))
  const buildLocation = vi.spyOn(router, 'buildLocation')
  const inactiveProps = vi.fn(() => ({
    href: 'javascript:override()',
    disabled: false,
    ref: unwantedRef,
    className: 'inactive-state',
    title: 'Inactive',
  }))
  const tree = (
    <RouterContextProvider router={router}>
      <CustomLink
        to="javascript:blocked()"
        ref={ref}
        search={search}
        inactiveProps={inactiveProps}
      >
        Target
      </CustomLink>
    </RouterContextProvider>
  )
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    router.isServer = true
    const html = renderToString(tree)
    expect(html).toContain('data-disabled="true"')
    expect(html).toContain('class="inactive-state"')
    expect(html).not.toContain('href=')
    router.isServer = false
    const anchor = render(tree).getByText('Target')
    expect(anchor).toHaveAttribute('data-disabled', 'true')
    expect(anchor).not.toHaveAttribute('href')
    expect(anchor).toHaveClass('inactive-state')
    expect(ref.current).toBe(anchor)
    expect(inactiveProps).toHaveBeenCalled()
    expect(unwantedRef).not.toHaveBeenCalled()
    expect(buildLocation).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  } finally {
    warn.mockRestore()
    buildLocation.mockRestore()
  }
})

test.each([false, true])(
  'blocked links preserve inactive styling from SSR to client (disabled=%s)',
  async (disabled) => {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
    })
    const inactiveProps = {
      className: 'inactive-state',
      style: { color: 'blue' },
      href: 'javascript:inactive()',
      title: 'Inactive',
    }
    const tree = (
      <RouterContextProvider router={router}>
        <Link
          to="javascript:blocked()"
          disabled={disabled}
          className="base"
          style={{ fontWeight: 700 }}
          inactiveProps={inactiveProps}
        >
          {({ isActive }) => String(isActive)}
        </Link>
      </RouterContextProvider>
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      router.isServer = true
      const serverContainer = document.createElement('div')
      serverContainer.innerHTML = renderToString(tree)
      const serverLink = serverContainer.querySelector('a')!
      router.isServer = false
      const clientLink = render(tree).container.querySelector('a')!
      expect(serverLink.className).toBe('base inactive-state')
      expect(serverLink).toHaveStyle({
        color: 'rgb(0, 0, 255)',
        fontWeight: '700',
      })
      expect(serverLink).not.toHaveAttribute('href')
      expect(serverLink).toHaveAttribute('aria-disabled', 'true')
      expect(serverLink).not.toHaveAttribute('aria-current')
      expect(serverLink).toHaveAttribute('title', 'Inactive')
      expect(serverLink.textContent).toBe('false')
      expect(
        Object.fromEntries(
          Array.from(clientLink.attributes, (attr) => [
            attr.name,
            attr.name === 'style' ? clientLink.style.cssText : attr.value,
          ]),
        ),
      ).toEqual(
        Object.fromEntries(
          Array.from(serverLink.attributes, (attr) => [
            attr.name,
            attr.name === 'style' ? serverLink.style.cssText : attr.value,
          ]),
        ),
      )
      const diagnostics = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      const recoverableError = vi.fn()
      let hydrated: ReturnType<typeof hydrateRoot> | undefined
      try {
        await act(() => {
          hydrated = hydrateRoot(serverContainer, tree, {
            onRecoverableError: recoverableError,
          })
        })
        expect(serverContainer.querySelector('a')).toBe(serverLink)
        expect(serverLink).not.toHaveAttribute('href')
        expect(serverLink).toHaveClass('inactive-state')
        expect(diagnostics).not.toHaveBeenCalled()
        expect(recoverableError).not.toHaveBeenCalled()
      } finally {
        await act(() => hydrated?.unmount())
        diagnostics.mockRestore()
      }
    } finally {
      warn.mockRestore()
    }
  },
)

test('external destinations skip state props across mounted link transitions', async () => {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/active' }),
      createRoute({ getParentRoute: () => root, path: '/other' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/active'] }),
    rewrite: {
      output: ({ url }) =>
        url.pathname === '/rewritten'
          ? new URL('https://other.example/rewritten')
          : url,
    },
  })
  await router.load()
  const activeProps = vi.fn(() => ({
    className: 'active-state',
    style: { color: 'red' },
    href: 'javascript:active()',
  }))
  const inactiveProps = vi.fn(() => ({
    className: 'inactive-state',
    style: { color: 'blue' },
    href: 'javascript:inactive()',
  }))
  const content = (to: string) => (
    <RouterContextProvider router={router}>
      <Link
        to={to}
        className="base"
        style={{ color: 'black', fontWeight: 700 }}
        activeProps={activeProps}
        inactiveProps={inactiveProps}
      >
        Target
      </Link>
    </RouterContextProvider>
  )
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const view = render(content('/active'))
    for (const [to, href, state] of [
      ['/active', '/active', 'active'],
      [
        'https://other.example/direct',
        'https://other.example/direct',
        'external',
      ],
      ['/rewritten', 'https://other.example/rewritten', 'external'],
      ['javascript:blocked()', null, 'inactive'],
      ['/other', '/other', 'inactive'],
      ['/active', '/active', 'active'],
    ] as const) {
      activeProps.mockClear()
      inactiveProps.mockClear()
      view.rerender(content(to))
      const anchor = view.getByText('Target')
      expect(anchor.getAttribute('href')).toBe(href)
      expect(anchor.className).toBe(
        state === 'external' ? 'base' : `base ${state}-state`,
      )
      expect(anchor).toHaveStyle({
        color:
          state === 'active'
            ? 'rgb(255, 0, 0)'
            : state === 'inactive'
              ? 'rgb(0, 0, 255)'
              : 'rgb(0, 0, 0)',
        fontWeight: '700',
      })
      expect(anchor.getAttribute('aria-current')).toBe(
        state === 'active' ? 'page' : null,
      )
      expect(anchor.getAttribute('aria-disabled')).toBe(
        href === null ? 'true' : null,
      )
      if (state === 'external') {
        expect(activeProps).not.toHaveBeenCalled()
        expect(inactiveProps).not.toHaveBeenCalled()
      }
    }
  } finally {
    warn.mockRestore()
  }
})

test.each([false, true])(
  'active links preserve styling while disabled changes (masked=%s)',
  async (masked) => {
    const root = createRootRoute()
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '/active' }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/active'] }),
    })
    await router.load()
    const activeProps = {
      className: 'active-state',
      href: 'javascript:active()',
    }
    const content = (disabled: boolean) => (
      <RouterContextProvider router={router}>
        <Link
          to="/active"
          mask={masked ? { to: '/masked' } : undefined}
          disabled={disabled}
          activeProps={activeProps}
        >
          Target
        </Link>
      </RouterContextProvider>
    )
    const view = render(content(false))
    for (const disabled of [false, true, false]) {
      view.rerender(content(disabled))
      const anchor = view.getByText('Target')
      expect(anchor).toHaveClass('active-state')
      expect(anchor).toHaveAttribute('aria-current', 'page')
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

test('functional state props preserve styling and href precedence across transitions', async () => {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/active' }),
      createRoute({ getParentRoute: () => root, path: '/other' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/active'] }),
  })
  await router.load()
  const activeProps = vi.fn(() => ({
    className: 'active-state',
    style: { color: 'red' },
    href: 'javascript:active()',
  }))
  const inactiveProps = vi.fn(() => ({
    className: 'inactive-state',
    style: { color: 'blue' },
    href: 'javascript:inactive()',
  }))
  let version = 0
  const content = (to = '/active') => (
    <RouterContextProvider router={router}>
      <Link
        to={to}
        data-version={++version}
        className="base"
        style={{ color: 'black', fontWeight: 700 }}
        activeProps={activeProps}
        inactiveProps={inactiveProps}
      >
        Target
      </Link>
    </RouterContextProvider>
  )
  const view = render(content())
  for (const pathname of ['/active', '/other', '/active']) {
    await act(() => router.navigate({ to: pathname }))
    activeProps.mockClear()
    inactiveProps.mockClear()
    view.rerender(content())
    const active = pathname === '/active'
    expect(active ? activeProps : inactiveProps).toHaveBeenCalled()
    expect(active ? inactiveProps : activeProps).not.toHaveBeenCalled()
    const anchor = view.getByText('Target')
    expect(anchor).toHaveAttribute('href', '/active')
    expect(anchor.className).toBe(
      `base ${active ? 'active-state' : 'inactive-state'}`,
    )
    expect(anchor).toHaveStyle({
      color: active ? 'rgb(255, 0, 0)' : 'rgb(0, 0, 255)',
      fontWeight: '700',
    })
  }
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    view.rerender(content('javascript:blocked()'))
    expect(view.getByText('Target')).not.toHaveAttribute('href')
    expect(view.getByText('Target').className).toBe('base inactive-state')
  } finally {
    warn.mockRestore()
  }
})
