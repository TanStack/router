/** @jsxImportSource solid-js */
import { renderToString } from 'solid-js/web'
import { expect, test, vi } from 'vitest'
import {
  RouterContextProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../../src'
import type { JSX } from 'solid-js'

test.each([
  { to: 'https://example.com/', href: 'https://example.com/' },
  { to: '/external', href: 'https://example.com/rewritten' },
])('SSR custom links retain caller props for $to', ({ to, href }) => {
  let received: JSX.AnchorHTMLAttributes<HTMLAnchorElement> | undefined
  const CustomLink = createLink(
    (props: JSX.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      received = { ...props }
      return <a />
    },
  )
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory(),
    isServer: true,
    rewrite: {
      output: ({ url }) =>
        url.pathname === '/external'
          ? new URL('https://example.com/rewritten')
          : url,
    },
  })
  const handlers = {
    onClick: vi.fn(),
    onBlur: vi.fn(),
    onFocus: vi.fn(),
    onMouseEnter: vi.fn(),
    onMouseLeave: vi.fn(),
    onMouseOut: vi.fn(),
    onMouseOver: vi.fn(),
    onTouchStart: vi.fn(),
  }
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    renderToString(() => (
      <RouterContextProvider router={router}>
        {() => (
          <CustomLink
            to={to}
            href={to.startsWith('/') ? undefined : 'javascript:spoofed()'}
            target="_blank"
            title="custom link"
            {...handlers}
          />
        )}
      </RouterContextProvider>
    ))
    expect(received).toMatchObject({
      href,
      target: '_blank',
      title: 'custom link',
    })
    for (const name of Object.keys(handlers) as Array<keyof typeof handlers>) {
      const handler = received?.[name] as (event: Event) => void
      expect(handler).toBeTypeOf('function')
      const event = new Event('test', { cancelable: true })
      event.preventDefault()
      handler(event)
      expect(handlers[name]).toHaveBeenCalledExactlyOnceWith(event)
    }
    if (!href) {
      expect(received).toMatchObject({ role: 'link', 'aria-disabled': true })
    }
  } finally {
    warn.mockRestore()
  }
})
