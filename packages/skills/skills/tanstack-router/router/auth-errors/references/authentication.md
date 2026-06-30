# Authentication Patterns

Protect routes and manage user sessions.

## beforeLoad Guard

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
})
```

## Layout-Level Auth

Protect multiple routes with pathless layout:

```tsx
// routes/_authenticated.tsx
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    const user = await context.auth.getUser()
    if (!user) {
      throw redirect({ to: '/login' })
    }
    // Return user for child routes
    return { user }
  },
  component: () => <Outlet />,
})

// routes/_authenticated/dashboard.tsx - automatically protected
// routes/_authenticated/settings.tsx - automatically protected
```

## Role-Based Access

```tsx
export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ context }) => {
    if (!context.auth.user) {
      throw redirect({ to: '/login' })
    }
    if (context.auth.user.role !== 'admin') {
      throw redirect({ to: '/unauthorized' })
    }
  },
})
```

## Preserving Redirect Destination

```tsx
// Login route
const loginSearchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
})

function LoginPage() {
  const { redirect: redirectUrl } = Route.useSearch()
  const navigate = useNavigate()

  const handleLogin = async () => {
    await login()
    navigate({ to: redirectUrl || '/dashboard' })
  }
}
```

## Auth Context Setup

```tsx
// router.tsx
const router = createRouter({
  routeTree,
  context: {
    auth: undefined!, // Set by provider
  },
})

// App.tsx
function App() {
  const auth = useAuth() // Your auth hook

  return <RouterProvider router={router} context={{ auth }} />
}
```
