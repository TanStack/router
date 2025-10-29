/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { createServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { DefaultCatchBoundary } from '../components/DefaultCatchBoundary'
import { NotFound } from '../components/NotFound'
import appCss from '../styles/app.css?url'
import { seo } from '../utils/seo'
import { getSupabaseServerClient } from '../utils/supabase'

/**
 * ⚠️ IMPORTANT: Server Function Serialization Requirements
 *
 * Server functions in TanStack Start can ONLY return serializable data.
 * This means data that can be converted to JSON and sent to the client.
 *
 * Supabase's `data.user` object contains NON-serializable properties:
 * - Functions (e.g., user.toString, internal methods)
 * - Complex metadata objects with circular references
 * - Internal Supabase client state
 *
 * ❌ WRONG - This will cause "Cannot serialize function" errors:
 * ```
 * return data.user  // Contains functions and complex objects
 * ```
 *
 * ✅ CORRECT - Extract only primitive values:
 * ```
 * return {
 *   email: data.user.email,  // string ✅
 *   id: data.user.id,        // string ✅
 *   role: data.user.role,    // string ✅
 * }
 * ```
 *
 * What's serializable?
 * - ✅ Primitives: string, number, boolean, null
 * - ✅ Plain objects: { key: value }
 * - ✅ Arrays: [1, 2, 3]
 * - ❌ Functions, class instances, undefined
 * - ❌ Date objects (convert to ISO string: date.toISOString())
 *
 * Learn more:
 * - Server Functions: https://tanstack.com/router/latest/docs/framework/react/start/server-functions
 * - Supabase SSR: https://supabase.com/docs/guides/auth/server-side-rendering
 */
const fetchUser = createServerFn({ method: 'GET' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()

  // Always handle errors explicitly - don't suppress them
  if (error) {
    console.error('[fetchUser] Supabase auth error:', error.message)
    return null
  }

  if (!data.user?.email) {
    return null
  }

  // IMPORTANT: Only return serializable fields from the user object
  // Add more fields here as needed (all must be primitives or plain objects)
  return {
    email: data.user.email,
    // You can safely add more primitive fields:
    // id: data.user.id,
    // role: data.user.role,
    // name: data.user.user_metadata?.name ?? null,
  }
})

export const Route = createRootRoute({
  beforeLoad: async () => {
    const user = await fetchUser()

    return {
      user,
    }
  },
  head: () => ({
    meta: [
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
    links: [
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
  }),
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
  const { user } = Route.useRouteContext()

  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="p-2 flex gap-2 text-lg">
          <Link
            to="/"
            activeProps={{
              className: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link
            to="/posts"
            activeProps={{
              className: 'font-bold',
            }}
          >
            Posts
          </Link>
          <div className="ml-auto">
            {user ? (
              <>
                <span className="mr-2">{user.email}</span>
                <Link to="/logout">Logout</Link>
              </>
            ) : (
              <Link to="/login">Login</Link>
            )}
          </div>
        </div>
        <hr />
        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
