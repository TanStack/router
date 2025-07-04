/// <reference types="vite/client" />
import { Link, Outlet, createRootRoute } from '@tanstack/solid-router'
import { z } from 'zod'
import type * as Solid from 'solid-js'
import { ssrSchema } from '~/search'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Selective SSR E2E Test',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  validateSearch: z.object({ root: ssrSchema }),
  ssr: ({ search }) => {
    if (typeof window !== 'undefined') {
      const error = `ssr() for ${Route.id} should not be called on the client`
      console.error(error)
      throw new Error(error)
    }
    if (search.status === 'success') {
      return search.value.root?.ssr
    }
  },
  beforeLoad: ({ search }) => {
    if (typeof window !== 'undefined') {
      if (Route.options.ssr !== undefined) {
        const error = `ssr() for ${Route.id} should have been deleted from the Route options on the client`
        console.error(error)
        throw new Error(error)
      }
    }
    console.log(
      `beforeLoad for ${Route.id} called on the ${typeof window !== 'undefined' ? 'client' : 'server'}`,
    )
    if (
      search.root?.expected?.data === 'client' &&
      typeof window === 'undefined'
    ) {
      const error = `Expected beforeLoad for ${Route.id} to be executed on the client, but it is running on the server`
      console.error(error)
      throw new Error(error)
    }
    return {
      root: typeof window === 'undefined' ? 'server' : 'client',
      search,
    }
  },
  loader: ({ context }) => {
    console.log(
      `loader for ${Route.id} called on the ${typeof window !== 'undefined' ? 'client' : 'server'}`,
    )

    if (
      context.search.root?.expected?.data === 'client' &&
      typeof window === 'undefined'
    ) {
      const error = `Expected loader for ${Route.id} to be executed on the client, but it is running on the server`
      console.error(error)
      throw new Error(error)
    }
    return { root: typeof window === 'undefined' ? 'server' : 'client' }
  },
  shellComponent: RootDocument,
  component: () => {
    const search = Route.useSearch()
    if (
      typeof window === 'undefined' &&
      search().root?.expected?.render === 'client-only'
    ) {
      const error = `Expected component for ${Route.id} to be executed on the client, but it is running on the server`
      console.error(error)
      throw new Error(error)
    }
    const loaderData = Route.useLoaderData()
    const context = Route.useRouteContext()
    return (
      <div data-testid="root-container">
        <h2 data-testid="root-heading">root</h2>
        <div>
          ssr: <b>{JSON.stringify(search().root?.ssr ?? 'undefined')}</b>
        </div>
        <div>
          expected data location execution:{' '}
          <b data-testid="root-data-expected">
            {search().root?.expected?.data}
          </b>
        </div>
        <div>
          loader: <b data-testid="root-loader">{loaderData().root}</b>
        </div>
        <div>
          context: <b data-testid="root-context">{context().root}</b>
        </div>
        <hr />
        <Outlet />
      </div>
    )
  },
})

function RootDocument({ children }: { children: Solid.JSX.Element }) {
  return (
    <>
      <div class="p-2 flex gap-2 text-lg">
        <h1>Selective SSR E2E Test</h1>
        <Link
          to="/"
          activeProps={{
            class: 'font-bold',
          }}
        >
          Home
        </Link>
      </div>
      <hr />
      {children}
    </>
  )
}
