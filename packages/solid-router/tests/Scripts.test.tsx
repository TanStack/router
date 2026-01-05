import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render } from '@solidjs/testing-library'

import {
  HeadContent,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { Scripts } from '../src/Scripts'

afterEach(() => {
  cleanup()
})

describe('ssr scripts', () => {
  test('it works', async () => {
    const rootRoute = createRootRoute({
      // loader: () => new Promise((r) => setTimeout(r, 1)),
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
        return <Scripts />
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
      // loader: () => new Promise((r) => setTimeout(r, 2)),
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
        return <Scripts />
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
      scripts: () => [{ src: 'script3.js' }],
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

    const { container } = render(() => <RouterProvider router={router} />)

    expect(container.innerHTML).toEqual(
      '<script src="script.js"></script><script src="script3.js"></script>',
    )
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
  })
})

describe('client HeadContent', () => {
  test('renders and cleans up head tags', async () => {
    const rootRoute = createRootRoute({
      head: () => ({
        meta: [
          { title: 'Root' },
          { name: 'description', content: 'Root description' },
        ],
        links: [{ rel: 'stylesheet', href: '/root.css' }],
        styles: [{ children: '.root{color:red}' }],
      }),
      component: () => {
        return <HeadContent />
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
      head: () => ({
        meta: [
          { title: 'Index' },
          { name: 'description', content: 'Index description' },
        ],
        links: [{ rel: 'stylesheet', href: '/index.css' }],
        styles: [{ children: '.index{color:red}' }],
      }),
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    await router.load()

    const { unmount } = render(() => <RouterProvider router={router} />)

    const meta = document.head.querySelector('meta[name="description"]')
    const link = document.head.querySelector(
      'link[rel="stylesheet"][href="/index.css"]',
    )
    const style = Array.from(document.head.querySelectorAll('style')).find(
      (el) => el.textContent === '.index{color:red}',
    )
    const title = Array.from(document.head.querySelectorAll('title')).find(
      (el) => el.textContent === 'Index',
    )

    expect(meta?.getAttribute('content')).toBe('Index description')
    expect(link).not.toBeNull()
    expect(style).not.toBeUndefined()
    expect(title).not.toBeUndefined()

    unmount()

    expect(
      document.head.querySelector('meta[name="description"]'),
    ).toBeNull()
    expect(
      document.head.querySelector('link[rel="stylesheet"][href="/index.css"]'),
    ).toBeNull()
    expect(
      Array.from(document.head.querySelectorAll('style')).find(
        (el) => el.textContent === '.index{color:red}',
      ),
    ).toBeUndefined()
    expect(
      Array.from(document.head.querySelectorAll('title')).find(
        (el) => el.textContent === 'Index',
      ),
    ).toBeUndefined()
  })
})
