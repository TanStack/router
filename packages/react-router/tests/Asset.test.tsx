import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import {
  Asset,
  HeadContent,
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'
import type { RouterManagedTag } from '@tanstack/router-core'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

test.each([
  ['absent', {}, 'default'],
  ['explicit undefined', { precedence: undefined }, null],
  ['explicit string', { precedence: 'custom' }, 'custom'],
])('renders stylesheet precedence when %s', (_name, attrs, expected) => {
  const html = renderToString(
    <Asset
      tag="link"
      attrs={{ rel: 'stylesheet', href: '/app.css', ...attrs }}
    />,
  )
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const stylesheet = doc.querySelector('link[rel="stylesheet"]')

  expect(stylesheet).not.toBeNull()
  expect(stylesheet?.getAttribute('data-precedence')).toBe(expected)
})

test('keeps an opted-out route stylesheet after a classic inline theme script during SSR', async () => {
  const rootRoute = createRootRoute({
    head: () => ({
      links: [{ rel: 'stylesheet', href: '/theme.css', precedence: undefined }],
    }),
    component: () => (
      <html>
        <head>
          <Asset tag="script">
            {'document.documentElement.dataset.theme="dark"'}
          </Asset>
          <HeadContent />
        </head>
        <body />
      </html>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory(),
    isServer: true,
  })
  await router.load()

  const html = renderToString(<RouterProvider router={router} />)
  const doc = new DOMParser().parseFromString(html, 'text/html')

  expect(Array.from(doc.head.children, (element) => element.tagName)).toEqual([
    'SCRIPT',
    'LINK',
  ])
  expect(doc.head.querySelector('script')?.textContent).toBe(
    'document.documentElement.dataset.theme="dark"',
  )
  expect(doc.head.querySelector('link')?.getAttribute('href')).toBe(
    '/theme.css',
  )
  expect(
    doc.head.querySelector('link')?.getAttribute('data-precedence'),
  ).toBeNull()
})

test.each([
  ['style', { tag: 'style' }],
  ['inline CSS', { tag: 'style', inlineCss: true }],
  ['JSON-LD script', { tag: 'script', attrs: { type: 'application/ld+json' } }],
  ['JSON script', { tag: 'script', attrs: { type: 'application/json' } }],
] satisfies Array<[string, RouterManagedTag]>)(
  '%s only replaces content when it changes',
  (_name, asset: Extract<RouterManagedTag, { tag: 'style' | 'script' }>) => {
    vi.stubEnv('TSS_INLINE_CSS_ENABLED', 'true')
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
    })
    const initial =
      asset.tag === 'style' ? '.asset{color:red}' : '{"value":"initial"}'
    const updated =
      asset.tag === 'style' ? '.asset{color:blue}' : '{"value":"updated"}'
    const renderAsset = (children: string, version: string) => (
      <RouterContextProvider router={router}>
        <Asset
          {...asset}
          attrs={{
            ...asset.attrs,
            'data-testid': 'asset',
            'data-version': version,
          }}
        >
          {children}
        </Asset>
      </RouterContextProvider>
    )
    const { getByTestId, rerender } = render(renderAsset(initial, 'initial'))
    const element = getByTestId('asset')
    const text = element.firstChild
    expect(element.textContent).toBe(initial)
    expect(text).not.toBeNull()

    rerender(renderAsset(initial, 'rerender'))
    expect(getByTestId('asset')).toBe(element)
    expect(element).toHaveAttribute('data-version', 'rerender')
    expect(element.firstChild).toBe(text)

    rerender(renderAsset(updated, 'updated'))
    expect(getByTestId('asset')).toBe(element)
    expect(element.textContent).toBe(updated)
    expect(element.firstChild).not.toBe(text)

    rerender(renderAsset('', 'empty'))
    expect(element.textContent).toBe('')
  },
)

test.each([undefined, '/asset.js'])(
  'injects and cleans up executable scripts with src=%s',
  (src) => {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
    })
    const { unmount } = render(
      <RouterContextProvider router={router}>
        <Asset
          tag="script"
          attrs={{
            id: 'injected-asset',
            src,
            async: true,
            defer: false,
            nonce: 'asset-nonce',
            'data-empty': '',
            'data-omitted': undefined,
            suppressHydrationWarning: true,
          }}
        >
          {src ? undefined : 'void 0'}
        </Asset>
      </RouterContextProvider>,
    )
    const script =
      document.head.querySelector<HTMLScriptElement>('#injected-asset')
    expect(script).toHaveAttribute('async', '')
    expect(script).not.toHaveAttribute('defer')
    expect(script).toHaveAttribute('data-empty', '')
    expect(script).not.toHaveAttribute('data-omitted')
    expect(script).not.toHaveAttribute('suppresshydrationwarning')
    expect(script?.nonce).toBe('asset-nonce')
    expect(script?.textContent).toBe(src ? '' : 'void 0')
    expect(script?.getAttribute('src')).toBe(src ?? null)

    unmount()
    expect(script).not.toBeInTheDocument()
  },
)

test.each(['/asset.js', '//cdn.example.com/asset.js', 'http://['])(
  'reuses existing executable scripts with src=%s',
  (src) => {
    const existing = document.createElement('script')
    existing.src = src
    document.head.appendChild(existing)
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
    })

    try {
      const { unmount } = render(
        <RouterContextProvider router={router}>
          <Asset tag="script" attrs={{ src }} />
        </RouterContextProvider>,
      )
      expect(Array.from(document.scripts)).toEqual([existing])

      unmount()
      expect(existing).toBeInTheDocument()
    } finally {
      existing.remove()
    }
  },
)

test.each([undefined, '', '/asset.js'])(
  'only deduplicates inline content against scripts without src (src=%s)',
  (src) => {
    const existing = document.createElement('script')
    existing.textContent = 'void 0'
    if (src !== undefined) {
      existing.setAttribute('src', src)
    }
    document.head.appendChild(existing)
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
    })

    try {
      const { unmount } = render(
        <RouterContextProvider router={router}>
          <Asset tag="script">void 0</Asset>
        </RouterContextProvider>,
      )
      expect(document.scripts).toHaveLength(src === undefined ? 1 : 2)

      unmount()
      expect(Array.from(document.scripts)).toEqual([existing])
    } finally {
      existing.remove()
    }
  },
)
