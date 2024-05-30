import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools/production'
import { createRootRouteWithContext } from '@tanstack/react-router'
import { Outlet, ScrollRestoration } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Body, Head, Html, Meta, Scripts } from '@tanstack/start'
import * as React from 'react'
import { Toaster } from 'react-hot-toast'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { IconLink } from '~/components/IconLink'
import { NotFound } from '~/components/NotFound'
import { setExtraDelay } from '~/mocks/db'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  meta: () => [
    {
      charSet: 'utf-8',
    },
    {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1',
    },
    ...seo({
      title:
        'TanStack Start | Type-Safe, Client-First, Full-Stack React Framework',
      description: `TanStack Start is a type-safe, client-first, full-stack React framework. `,
    }),
  ],
  links: () => [
    { rel: 'stylesheet', href: appCss },
    {
      rel: 'apple-touch-icon',
      sizes: '180x180',
      href: '/apple-touch-icon.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '32x32',
      href: '/favicon-32x32.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '16x16',
      href: '/favicon-16x16.png',
    },
    { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
    { rel: 'icon', href: '/favicon.ico' },
  ],
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    )
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <Html>
      <Head>
        <Meta />
      </Head>
      <Body>
        <div className="h-full flex flex-col min-h-0">
          <div className="bg-slate-900 border-b border-slate-800 flex items-center justify-between py-4 px-8 box-border">
            <div className="block leading-3 w-1/3">
              <div className="font-black text-2xl text-white">Trellaux</div>
              <div className="text-slate-500">a TanStack Demo</div>
            </div>
            <div className="flex items-center gap-6">
              <label
                htmlFor="countries"
                className="block text-sm font-medium text-gray-900 dark:text-white"
              >
                Delay
              </label>
              <select
                className="border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                onChange={(event) => {
                  setExtraDelay(Number(event.currentTarget.value))
                }}
                defaultValue="0"
              >
                <option value="0">None</option>
                <option value="100">100</option>
                <option value="500">500</option>
                <option value="2000">2000</option>
              </select>
              <IconLink
                href="https://github.com/tkdodo/trellix-query"
                label="Source"
                icon="/github-mark-white.png"
              />
              <IconLink
                href="https://tanstack.com/query/latest"
                icon="/tanstack.png"
                label="Docs"
              />
            </div>
          </div>

          <div className="flex-grow min-h-0 h-full">
            {children}
            <Toaster />
          </div>
        </div>
        <ScrollRestoration />
        <ReactQueryDevtools />
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </Body>
    </Html>
  )
}
