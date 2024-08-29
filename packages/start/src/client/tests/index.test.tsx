import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'

import React from 'react'

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
      scripts: () => [
        {
          src: 'script.js',
        },
        {
          src: 'script2.js',
        },
      ],
      component: () => {
        return <Scripts />
      },
    })

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
      // loader: () => new Promise((r) => setTimeout(r, 2)),
      scripts: () => [
        {
          src: 'script3.js',
        },
      ],
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
      `<script id="__TSR_DEHYDRATED__">
          __TSR_DEHYDRATED__ = {
            data: '{}'
          }
        </script><script src="script.js"></script><script src="script2.js"></script><script src="script3.js"></script>`,
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
      meta: ({ loaderData }) => [
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
      ],
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
      meta: ({ loaderData }) => [
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
      ],
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
      { title: 'Index' },
      { name: 'description', content: 'Index' },
      { name: 'last-modified', content: '2021-10-10' },
    ])

    const { container } = render(<RouterProvider router={router} />)

    expect(container.innerHTML).toEqual(
      `<title>Index</title><meta name="image" content="image.jpg"><meta name="description" content="Index"><meta name="last-modified" content="2021-10-10">`,
    )
  })
})
