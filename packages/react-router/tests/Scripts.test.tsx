import { describe, expect, test } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import ReactDOMServer from 'react-dom/server'

import {
  HeadContent,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { Scripts } from '../src/Scripts'

describe('ssr scripts', () => {
  test('it works', async () => {
    const rootRoute = createRootRoute({
      head: () => {
        return {
          scripts: [
            {
              src: 'script.js',
            },
            {
              src: 'script2.js',
            },
          ],
        }
      },
      component: () => {
        return (
          <div>
            <div data-testid="root">root</div>
            <Outlet />
            <Scripts />
          </div>
        )
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
      head: () => {
        return {
          scripts: [
            {
              src: 'script3.js',
            },
          ],
        }
      },
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
      isServer: true,
    })

    await router.load()

    expect(router.state.matches.map((d) => d.headScripts).flat(1)).toEqual([
      { src: 'script.js' },
      { src: 'script2.js' },
      { src: 'script3.js' },
    ])
  })

  test('excludes `undefined` script values', async () => {
    const rootRoute = createRootRoute({
      scripts: () => [
        { src: 'script.js' },
        undefined, // 'script2.js' opted out by certain conditions, such as `NODE_ENV=production`.
      ],
      component: () => {
        return (
          <div>
            <div data-testid="root">root</div>
            <Outlet />
            <Scripts />
          </div>
        )
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
      scripts: () => [{ src: 'script3.js' }],
      component: () => {
        return <div data-testid="index">index</div>
      },
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
      isServer: true,
    })

    await router.load()

    expect(router.state.matches.map((d) => d.scripts).flat(1)).toEqual([
      { src: 'script.js' },
      undefined,
      { src: 'script3.js' },
    ])

    const { container } = await act(() =>
      render(<RouterProvider router={router} />),
    )
    expect(await screen.findByTestId('root')).toBeInTheDocument()
    expect(await screen.findByTestId('index')).toBeInTheDocument()

    expect(container.innerHTML).toEqual(
      `<div><div data-testid="root">root</div><div data-testid="index">index</div><script src="script.js"></script><script src="script3.js"></script></div>`,
    )
  })
})

describe('scripts with async/defer attributes', () => {
  test('server renders scripts with async/defer attributes in output', async () => {
    const rootRoute = createRootRoute({
      scripts: () => [
        {
          src: 'script.js',
          async: true,
        },
        {
          src: 'script2.js',
          defer: true,
        },
      ],
      component: () => {
        return (
          <div>
            <div data-testid="server-root">root</div>
            <Outlet />
            <Scripts />
          </div>
        )
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
      component: () => {
        return <div data-testid="server-index">index</div>
      },
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
      isServer: true,
    })

    await router.load()

    // Use ReactDOMServer.renderToString to test actual server output
    const html = ReactDOMServer.renderToString(
      <RouterProvider router={router} />,
    )

    expect(html).toMatch(/<script[^>]*src="script\.js"[^>]*async=""/)
    expect(html).toMatch(/<script[^>]*src="script2\.js"[^>]*defer=""/)
  })

  test('client renders scripts with attributes (including async/defer)', async () => {
    const rootRoute = createRootRoute({
      scripts: () => [
        {
          src: 'script.js',
          async: true,
          crossOrigin: 'anonymous',
        },
      ],
      component: () => {
        return (
          <div>
            <div data-testid="async-root">root</div>
            <Outlet />
            <Scripts />
          </div>
        )
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
      component: () => {
        return <div data-testid="async-index">index</div>
      },
    })

    // Clear head and any leftover body scripts between tests.
    document.head.innerHTML = ''
    document.querySelectorAll('body script').forEach((s) => s.remove())

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
      isServer: false, // Client-side rendering
    })

    await router.load()

    await act(() => render(<RouterProvider router={router} />))

    expect(await screen.findByTestId('async-root')).toBeInTheDocument()

    const script = document.querySelector('script[src="script.js"]')
    expect(script).toBeTruthy()

    // Attributes are preserved on the client.
    expect(script?.getAttribute('src')).toBe('script.js')
    expect(script?.hasAttribute('async')).toBe(true)
    expect(script?.getAttribute('crossorigin')).toBe('anonymous')
  })
})

describe('ssr HeadContent', () => {
  test('derives title, dedupes meta, and allows non-loader HeadContent', async () => {
    const rootRoute = createRootRoute({
      loader: () =>
        new Promise((r) => setTimeout(r, 1)).then(() => ({
          description: 'Root',
        })),
      head: ({ loaderData }) => {
        return {
          meta: [
            {
              title: 'Root',
            },
            {
              name: 'description',
              content: loaderData?.description,
            },
            {
              name: 'image',
              content: 'image.jpg',
            },
            {
              property: 'og:image',
              content: 'root-image.jpg',
            },
            {
              property: 'og:description',
              content: 'Root description',
            },
          ],
        }
      },
      component: () => {
        return <HeadContent />
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
      loader: () =>
        new Promise((r) => setTimeout(r, 2)).then(() => ({
          description: 'Index',
        })),
      head: ({ loaderData }) => {
        return {
          meta: [
            {
              title: 'Index',
            },
            {
              name: 'description',
              content: loaderData?.description,
            },
            {
              name: 'last-modified',
              content: '2021-10-10',
            },
            {
              property: 'og:image',
              content: 'index-image.jpg',
            },
          ],
        }
      },
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
      isServer: true,
    })

    await router.load()

    expect(router.state.matches.map((d) => d.meta).flat(1)).toEqual([
      { title: 'Root' },
      { name: 'description', content: 'Root' },
      { name: 'image', content: 'image.jpg' },
      { property: 'og:image', content: 'root-image.jpg' },
      { property: 'og:description', content: 'Root description' },
      { title: 'Index' },
      { name: 'description', content: 'Index' },
      { name: 'last-modified', content: '2021-10-10' },
      { property: 'og:image', content: 'index-image.jpg' },
    ])

    const html = ReactDOMServer.renderToString(
      <RouterProvider router={router} />,
    )
    expect(html).toEqual(
      `<title>Index</title><meta name="image" content="image.jpg"/><meta property="og:description" content="Root description"/><meta name="description" content="Index"/><meta name="last-modified" content="2021-10-10"/><meta property="og:image" content="index-image.jpg"/>`,
    )
  })
})

describe('data script rendering', () => {
  test('data script renders content on server (SSR)', async () => {
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Test Article',
    })

    const rootRoute = createRootRoute({
      scripts: () => [
        {
          type: 'application/ld+json',
          children: jsonLd,
        },
      ],
      component: () => {
        return (
          <div>
            <div data-testid="ssr-root">root</div>
            <Outlet />
            <Scripts />
          </div>
        )
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
      isServer: true,
    })

    await router.load()

    const html = ReactDOMServer.renderToString(
      <RouterProvider router={router} />,
    )

    expect(html).toContain('application/ld+json')
    expect(html).toContain(jsonLd)
  })

  test('data script preserves content on client', async () => {
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Test',
    })

    const rootRoute = createRootRoute({
      scripts: () => [
        {
          type: 'application/ld+json',
          children: jsonLd,
        },
      ],
      component: () => {
        return (
          <div>
            <div data-testid="data-client-root">root</div>
            <Outlet />
            <Scripts />
          </div>
        )
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    await router.load()

    const { container } = await act(() =>
      render(<RouterProvider router={router} />),
    )

    const rootEl = container.querySelector('[data-testid="data-client-root"]')
    expect(rootEl).not.toBeNull()

    const scriptEl = container.querySelector(
      'script[type="application/ld+json"]',
    )
    expect(scriptEl).not.toBeNull()
    expect(scriptEl!.innerHTML).toBe(jsonLd)
  })

  test('executable script is injected into document.head via useEffect on client', async () => {
    const rootRoute = createRootRoute({
      scripts: () => [
        {
          children: 'console.log("hello")',
        },
      ],
      component: () => {
        return (
          <div>
            <div data-testid="exec-root">root</div>
            <Outlet />
            <Scripts />
          </div>
        )
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    await router.load()

    const { container } = await act(() =>
      render(<RouterProvider router={router} />),
    )

    const rootEl = container.querySelector('[data-testid="exec-root"]')
    expect(rootEl).not.toBeNull()

    // Executable inline scripts are injected into document.head via useEffect,
    // not rendered in the React tree on the client.
    const headScript = document.head.querySelector(
      'script:not([type]):not([src])',
    )
    expect(headScript).not.toBeNull()
    expect(headScript!.textContent).toBe('console.log("hello")')
  })

  test('module script is injected into document.head via useEffect on client', async () => {
    const rootRoute = createRootRoute({
      scripts: () => [
        {
          type: 'module',
          children: 'import { foo } from "./foo.js"',
        },
      ],
      component: () => {
        return (
          <div>
            <div data-testid="module-root">root</div>
            <Outlet />
            <Scripts />
          </div>
        )
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    await router.load()

    const { container } = await act(() =>
      render(<RouterProvider router={router} />),
    )

    const rootEl = container.querySelector('[data-testid="module-root"]')
    expect(rootEl).not.toBeNull()

    // Module scripts are injected into document.head via useEffect,
    // not rendered in the React tree on the client.
    const moduleScript = document.head.querySelector('script[type="module"]')
    expect(moduleScript).not.toBeNull()
    expect(moduleScript!.textContent).toBe('import { foo } from "./foo.js"')
  })

  test('application/json data script preserves content', async () => {
    const jsonData = JSON.stringify({ config: { theme: 'dark' } })

    const rootRoute = createRootRoute({
      scripts: () => [
        {
          type: 'application/json',
          children: jsonData,
        },
      ],
      component: () => {
        return (
          <div>
            <div data-testid="json-root">root</div>
            <Outlet />
            <Scripts />
          </div>
        )
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    await router.load()

    const { container } = await act(() =>
      render(<RouterProvider router={router} />),
    )

    const rootEl = container.querySelector('[data-testid="json-root"]')
    expect(rootEl).not.toBeNull()

    const scriptEl = container.querySelector('script[type="application/json"]')
    expect(scriptEl).not.toBeNull()
    expect(scriptEl!.innerHTML).toBe(jsonData)
  })

  test('data script does not duplicate into document.head', async () => {
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test Org',
    })

    const rootRoute = createRootRoute({
      scripts: () => [
        {
          type: 'application/ld+json',
          children: jsonLd,
        },
      ],
      component: () => {
        return (
          <div>
            <div data-testid="dup-root">root</div>
            <Outlet />
            <Scripts />
          </div>
        )
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    await router.load()

    const { container } = await act(() =>
      render(<RouterProvider router={router} />),
    )

    const rootEl = container.querySelector('[data-testid="dup-root"]')
    expect(rootEl).not.toBeNull()

    // Data scripts should NOT be duplicated into document.head by useEffect
    const headScripts = document.head.querySelectorAll(
      'script[type="application/ld+json"]',
    )
    expect(headScripts.length).toBe(0)

    // Should only exist once in the container
    const containerScripts = container.querySelectorAll(
      'script[type="application/ld+json"]',
    )
    expect(containerScripts.length).toBe(1)
    expect(containerScripts[0]!.innerHTML).toBe(jsonLd)
  })

  test('empty string type is treated as executable, injected via useEffect on client', async () => {
    const rootRoute = createRootRoute({
      scripts: () => [
        {
          type: '',
          children: 'console.log("empty type")',
        },
      ],
      component: () => {
        return (
          <div>
            <div data-testid="empty-type-root">root</div>
            <Outlet />
            <Scripts />
          </div>
        )
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    await router.load()

    const { container } = await act(() =>
      render(<RouterProvider router={router} />),
    )

    const rootEl = container.querySelector('[data-testid="empty-type-root"]')
    expect(rootEl).not.toBeNull()

    // Empty type = text/javascript per HTML spec. Executable scripts are
    // injected into document.head via useEffect on the client.
    const scriptEl = document.head.querySelector('script[type=""]')
    expect(scriptEl).not.toBeNull()
    expect(scriptEl!.textContent).toBe('console.log("empty type")')
  })
})
