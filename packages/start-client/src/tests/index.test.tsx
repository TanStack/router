import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import ReactDOMServer from 'react-dom/server'

import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

import { Meta, Scripts } from '../index'

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
    })

    router.isServer = true

    await router.load()

    expect(router.state.matches.map((d) => d.scripts).flat(1)).toEqual([
      { src: 'script.js' },
      { src: 'script2.js' },
      { src: 'script3.js' },
    ])

    const { container } = render(<RouterProvider router={router} />)

    expect(container.innerHTML).toEqual(
      `<script src="script.js"></script><script src="script2.js"></script><script src="script3.js"></script>`,
    )
  })

  test('excludes `undefined` script values', async () => {
    const rootRoute = createRootRoute({
      head: () => {
        return {
          scripts: [
            { src: 'script.js' },
            undefined, // 'script2.js' opted out by certain conditions, such as `NODE_ENV=production`.
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
      head: () => {
        return {
          scripts: [{ src: 'script3.js' }],
        }
      },
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    router.isServer = true

    await router.load()

    expect(router.state.matches.map((d) => d.scripts).flat(1)).toEqual([
      { src: 'script.js' },
      undefined,
      { src: 'script3.js' },
    ])

    const { container } = render(<RouterProvider router={router} />)

    expect(container.innerHTML).toEqual(
      `<script src="script.js"></script><script src="script3.js"></script>`,
    )
  })
})

describe('ssr meta', () => {
  test('derives title, dedupes meta, and allows non-loader meta', async () => {
    const rootRoute = createRootRoute({
      loader: () =>
        new Promise((r) => setTimeout(r, 1)).then(() => ({
          description: 'Root',
        })),
      head: ({ loaderData }) => {
        if (!loaderData) {
          return {}
        }

        return {
          meta: [
            {
              title: 'Root',
            },
            {
              name: 'description',
              content: loaderData.description,
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
        return <Meta />
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
        if (!loaderData) {
          return {}
        }

        return {
          meta: [
            {
              title: 'Index',
            },
            {
              name: 'description',
              content: loaderData.description,
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
    })

    router.isServer = true

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
      `<title>Index</title><meta name="image" content="image.jpg"/><meta property="og:description" content="Root description"/><meta name="description" content="Index"/><meta name="last-modified" content="2021-10-10"/><meta property="og:image" content="index-image.jpg"/><!--$--><!--/$-->`,
    )
  })
})
