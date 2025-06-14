import { useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import './styles.css'
import { initialAuthHandle, initialAuthState, useAuth } from './auth'
import type { AuthHandle, AuthState } from './auth'

type RouterContext = {
  authState: AuthState
  authHandle: AuthHandle
}

function Application(props: { router: typeof router }) {
  const { router } = props
  const [authState, authHandle] = useAuth()
  const routerContext = useMemo(
    () => ({
      authState,
      authHandle,
    }),
    [authState],
  )

  useEffect(() => {
    // Invalidate cache when passing new auth context into the router (but avoid
    // invalidating the initial unauthenticated state)
    if (authState.type === 'authenticated' || authState.hasLoggedIn) {
      router.invalidate()
    }
  }, [router, routerContext])

  return <RouterProvider router={router} context={routerContext} />
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <div className="p-2 flex gap-2 text-lg border-b">
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
          to="/dashboard"
          search={{
            organizationId: 'x',
          }}
        >
          Dashboard
        </Link>
      </div>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
})

function IndexComponent() {
  return (
    <div className="p-2">
      <h3>Home</h3>
    </div>
  )
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  component: LoginComponent,
  validateSearch: (search): { redirect?: string } => {
    if (search.redirect) {
      return {
        redirect: search.redirect as string,
      }
    }
    return {}
  },
})

function LoginComponent() {
  const router = useRouter()
  const { authHandle } = loginRoute.useRouteContext()
  const navigate = loginRoute.useNavigate()
  const { redirect } = loginRoute.useSearch()

  return (
    <>
      <h3>Login Page</h3>
      <button
        onClick={async () => {
          await authHandle.login('123')
          if (redirect) {
            router.history.push(redirect)
          } else {
            navigate({
              to: '/dashboard',
              search: {
                organizationId: 'x',
              },
            })
          }
        }}
      >
        Log in
      </button>
    </>
  )
}

async function getIdentity({
  userId,
  organizationId,
}: {
  userId: string
  organizationId: string
}) {
  if (!userId || !organizationId) {
    throw new Error('Missing userId or organizationId')
  }

  return await {
    organizationName: `Organization #${organizationId}`,
    userName: `Employee #${userId}`,
  }
}

const dashboardRoute = createRoute({
  getParentRoute: () => organizationLayoutRoute,
  path: '/dashboard',
  loader: async ({ context }) => {
    return await getIdentity({
      userId: context.user.id,
      organizationId: context.organizationId,
    })
  },
  component: DashboardComponent,
})

function DashboardComponent() {
  const { userName, organizationName } = dashboardRoute.useLoaderData()

  return (
    <div>
      <h3>Dashboard</h3>
      <div>
        Welcome, {userName} of {organizationName}!
      </div>
    </div>
  )
}

const authenticatedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authenticated-layout',
  beforeLoad: async ({ context, location }) => {
    const resolvedAuthState = await context.authState
    if (resolvedAuthState.type !== 'authenticated') {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }

    return {
      user: resolvedAuthState.user,
    }
  },
  component: AuthenticatedLayoutComponent,
})

function AuthenticatedLayoutComponent() {
  const { authHandle } = authenticatedLayoutRoute.useRouteContext()

  return (
    <div className="p-2">
      <button
        onClick={() => {
          authHandle.logout()
        }}
      >
        Log out
      </button>
      <div>
        <Outlet />
      </div>
    </div>
  )
}

const organizationLayoutRoute = createRoute({
  getParentRoute: () => authenticatedLayoutRoute,
  id: '_organization-layout',
  beforeLoad: ({ search, location }) => {
    const organizationId = search.organizationId
    if (!organizationId) {
      throw redirect({
        to: location.pathname,
        search: {
          // Use default organizationId if none is provided
          organizationId: 'x',
        },
      })
    }

    return { organizationId }
  },
  loaderDeps: ({ search }) => {
    return {
      organizationId: search.organizationId,
    }
  },
  loader: async () => {
    // An empty loader here caused the test to fail when the test was initially
    // added.
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { organizationId: string | undefined } => {
    const organizationId = search.organizationId
    if (typeof organizationId === 'string' || organizationId === undefined) {
      return { organizationId }
    }
    throw new Error('Missing organizationId')
  },
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  authenticatedLayoutRoute.addChildren([
    organizationLayoutRoute.addChildren([dashboardRoute]),
  ]),
  indexRoute,
])

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: {
    authState: initialAuthState,
    authHandle: initialAuthHandle,
  },
  scrollRestoration: true,
})

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(<Application router={router} />)
}
