# Protected Routes

Route-level authentication and authorization.

## beforeLoad Guard

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

// Server function to get auth state
const getAuth = createServerFn().handler(async () => {
  const session = await useSession({ password: process.env.SESSION_SECRET! })
  if (!session.data.userId) return null

  return db.user.findUnique({ where: { id: session.data.userId } })
})

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async ({ location }) => {
    const user = await getAuth()

    if (!user) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }

    return { user }
  },
})
```

## Layout-Level Protection

```tsx
// routes/_authenticated.tsx
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const user = await getAuth()

    if (!user) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }

    return { user }
  },
  component: () => <Outlet />,
})

// routes/_authenticated/dashboard.tsx - automatically protected
// routes/_authenticated/settings.tsx - automatically protected
// routes/_authenticated/profile.tsx - automatically protected
```

## Role-Based Routes

```tsx
export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const user = await getAuth()

    if (!user) {
      throw redirect({ to: '/login' })
    }

    if (user.role !== 'admin') {
      throw redirect({ to: '/unauthorized' })
    }

    return { user }
  },
})
```

## Access User in Components

```tsx
function DashboardPage() {
  const { user } = Route.useRouteContext()

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      {user.role === 'admin' && <AdminPanel />}
    </div>
  )
}
```

## Redirect After Login

```tsx
// Login page
const loginSearch = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: loginSearch,
})

function LoginPage() {
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()

  const handleLogin = async () => {
    await login({ data: credentials })
    navigate({ to: redirect || '/dashboard' })
  }
}
```
