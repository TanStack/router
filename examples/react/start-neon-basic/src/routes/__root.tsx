/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import {
  StackProvider,
  StackTheme,
} from '@stackframe/react'
import * as React from 'react'
import { DefaultCatchBoundary } from '../components/DefaultCatchBoundary'
import { NotFound } from '../components/NotFound'
import appCss from '../styles/app.css?url'
import { seo } from '../utils/seo'
import { stackClientApp } from '../stack'

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
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <StackProvider app={stackClientApp}>
          <React.Suspense fallback={<div>Loading...</div>}>
            <InnerApp>{children}</InnerApp>
          </React.Suspense>
        </StackProvider>
      </body>
    </html>
  )
}

function InnerApp({ children }: { children: React.ReactNode }) {
  return (
    <StackTheme>
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
        <ClientAuth />
      </div>
      <hr />
      {children}
      <TanStackRouterDevtools position="bottom-right" />
      <Scripts />
    </StackTheme>
  )
}

// Simple client-only authentication
function ClientAuth() {
  const [isClient, setIsClient] = React.useState(false)
  const [user, setUser] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)
  
  React.useEffect(() => {
    setIsClient(true)
    
    // Check if user is logged in
    const checkUser = async () => {
      try {
        const currentUser = await stackClientApp.getUser()
        setUser(currentUser)
      } catch (error) {
        console.log('No user logged in')
      } finally {
        setLoading(false)
      }
    }
    
    checkUser()
  }, [])
  
  const handleLogout = async () => {
    try {
      if (user) {
        await user.signOut()
      }
      setUser(null)
      window.location.href = '/'
    } catch (error) {
      console.error('Logout error:', error)
    }
  }
  
  if (!isClient || loading) {
    return (
      <div className="ml-auto">
        <span>Loading...</span>
      </div>
    )
  }
  
  if (user) {
    // Use the correct property path for email
    const userEmail = user.primaryEmail || user.displayName || 'User'
    
    return (
      <div className="ml-auto">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            Welcome, {userEmail}!
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-8 items-center justify-center rounded-md px-4 text-[13px] font-medium cursor-pointer text-red-600 transition-all hover:bg-red-50"
          >
            Log Out
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="ml-auto">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => stackClientApp.redirectToSignIn()}
          className="inline-flex h-8 items-center justify-center rounded-md px-4 text-[13px] font-medium cursor-pointer text-gray-700 transition-all hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Log In
        </button>
        <button
          type="button"
          onClick={() => stackClientApp.redirectToSignUp()}
          className="inline-flex h-8 items-center justify-center font-medium text-center rounded-full outline-none cursor-pointer dark:text-black bg-cyan-600 hover:bg-cyan-500 whitespace-nowrap px-6 text-[13px] transition-colors duration-200"
        >
          Sign Up
        </button>
      </div>
    </div>
  )
}
