# Router Context

Dependency injection for routes via context.

## Setup

```tsx
// router.tsx
import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'

interface RouterContext {
  queryClient: QueryClient
  auth: {
    user: User | null
    isAuthenticated: boolean
  }
}

const router = createRouter({
  routeTree,
  context: {
    queryClient: undefined!,
    auth: undefined!,
  } as RouterContext,
})
```

## Providing Context

```tsx
// App.tsx
function App() {
  const queryClient = new QueryClient()
  const auth = useAuth()

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ queryClient, auth }} />
    </QueryClientProvider>
  )
}
```

## Using in Routes

```tsx
export const Route = createFileRoute('/dashboard')({
  beforeLoad: async ({ context }) => {
    // Access auth from context
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
  loader: async ({ context }) => {
    // Access queryClient from context
    return context.queryClient.fetchQuery({
      queryKey: ['dashboard'],
      queryFn: fetchDashboard,
    })
  },
})
```

## Extending Context in beforeLoad

```tsx
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    const user = await context.auth.getUser()
    // Return value extends context for child routes
    return { user }
  },
})

// Child route
export const Route = createFileRoute('/_authenticated/profile')({
  loader: async ({ context }) => {
    // context.user is available from parent's beforeLoad
    return fetchProfile(context.user.id)
  },
})
```

## Type Safety

```tsx
// Extend Register for global types
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Context is now typed in all routes
```

## Accessing in Components

```tsx
function Component() {
  const context = Route.useRouteContext()
  // Or from any route
  const context = useRouteContext({ from: '/dashboard' })
}
```
