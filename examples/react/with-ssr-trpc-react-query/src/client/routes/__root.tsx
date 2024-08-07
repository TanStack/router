import { Body, Head, Html, Meta, Scripts } from '@tanstack/start'
import {
  Link,
  Outlet,
  ScrollRestoration,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import type { createTRPCQueryUtils } from '@trpc/react-query'

import type { AppRouter, Caller } from '../trpc'

export const Route = createRootRouteWithContext<{
  // caller will only exist on the server
  caller?: Caller
  trpcQueryUtils: ReturnType<typeof createTRPCQueryUtils<AppRouter>>
}>()({
  component: () => {
    return (
      <Html lang="en">
        <Head>
          <Meta />
        </Head>
        <Body>
          <ScrollRestoration />
          <div className="top-nav">
            <Link
              activeProps={{ className: 'active-route' }}
              activeOptions={{ exact: true }}
              to="/"
            >
              Home
            </Link>
            <Link
              activeProps={{ className: 'active-route' }}
              activeOptions={{ exact: true }}
              to="/blog"
            >
              Blog
            </Link>
          </div>
          <Outlet />
          <ReactQueryDevtools buttonPosition="bottom-left" />
          <TanStackRouterDevtools position="bottom-right" />
          <Scripts />
        </Body>
      </Html>
    )
  },
  links() {
    return [
      {
        href: '/styles.css',
        rel: 'stylesheet',
      },
      /** @see https://favicons.joshuasoileau.com/ */
      {
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>😎</text></svg>",
        rel: 'icon',
      },
    ]
  },
  /** meta tags with a "name" attribute can be overridden by re-specifying in a more precise route, so it is ok to specify defaults here.
   * the open graph (og) protocol uses the "property" attribute rather than the "name" attribute and allows specifying multiple meta tags with the same "property" attribute value but different "content" attribute values.
   * therefore, here we only specify og meta tags which should apply to all pages.
   */
  meta() {
    return [
      { charSet: 'utf-8' },
      {
        content: 'height=device-height, width=device-width, initial-scale=1',
        name: 'viewport',
      },
      { title: 'test' },
      {
        content: 'test',
        name: 'title',
      },
      {
        content: 'lorem ipsum',
        name: 'description',
      },
      {
        content: 'en_US',
        property: 'og:locale',
      },
    ]
  },
  scripts() {
    return [
      {
        type: 'module',
        children: `import RefreshRuntime from "/@react-refresh"\nRefreshRuntime.injectIntoGlobalHook(window)\nwindow.$RefreshReg$ = () => {}\nwindow.$RefreshSig$ = () => (type) => type\nwindow.__vite_plugin_react_preamble_installed__ = true`,
      },
      {
        type: 'module',
        src: '/@vite/client',
      },
      {
        src: '/mount.tsx',
        type: 'module',
      },
    ]
  },
})
