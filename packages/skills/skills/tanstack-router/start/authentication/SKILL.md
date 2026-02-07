---
name: tanstack-start-authentication
description: |
  Authentication patterns in TanStack Start.
  Use for server-side auth, sessions, protected server functions, auth middleware.
---

# Authentication

TanStack Start provides server-side authentication patterns with sessions and middleware.

## Common Patterns

### Pattern 1: Session Setup with useAppSession

```tsx
// app/utils/session.ts
import { useSession } from '@tanstack/react-start/server'

type SessionData = {
  userId: string | null
  email: string | null
  role: 'admin' | 'user' | null
}

export function useAppSession() {
  return useSession<SessionData>({
    password: process.env.SESSION_SECRET!, // 32+ chars
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
}
```

### Pattern 2: Login Server Function

```tsx
import { createServerFn } from '@tanstack/react-start'
import { useAppSession } from './session'
import bcrypt from 'bcryptjs'

export const loginFn = createServerFn({ method: 'POST' })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const user = await db.user.findUnique({ where: { email: data.email } })
    if (!user) throw new Error('Invalid credentials')

    const valid = await bcrypt.compare(data.password, user.hashedPassword)
    if (!valid) throw new Error('Invalid credentials')

    const session = await useAppSession()
    await session.update({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    return { success: true }
  })
```

### Pattern 3: Protected Route with beforeLoad

```tsx
// app/routes/dashboard.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getCurrentUserFn } from '../utils/auth'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const user = await getCurrentUserFn()
    if (!user) {
      throw redirect({ to: '/login', search: { redirect: '/dashboard' } })
    }
    return { user }
  },
  component: Dashboard,
})

function Dashboard() {
  const { user } = Route.useRouteContext()
  return <div>Welcome, {user.email}</div>
}
```

### Pattern 4: Get Current User Server Function

```tsx
export const getCurrentUserFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await useAppSession()
    if (!session.data.userId) return null

    const user = await db.user.findUnique({
      where: { id: session.data.userId },
      select: { id: true, email: true, role: true },
    })
    return user
  },
)
```

### Pattern 5: Logout Server Function

```tsx
export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await useAppSession()
  await session.update({ userId: null, email: null, role: null })
  return { success: true }
})
```

### Pattern 6: Role-Based Access Control

```tsx
const requireRole = (allowedRoles: Array<'admin' | 'user'>) =>
  createServerFn({ method: 'GET' }).handler(async () => {
    const session = await useAppSession()
    if (!session.data.role || !allowedRoles.includes(session.data.role)) {
      throw new Error('Unauthorized')
    }
    return session.data
  })

// Usage in route
beforeLoad: async () => {
  await requireRole(['admin'])
}
```

## API Quick Reference

```tsx
import { useSession } from '@tanstack/react-start/server'

// Session management
useSession<T>(options): Promise<Session<T>>

interface SessionOptions {
  password: string          // 32+ character secret
  cookie?: {
    name?: string           // Cookie name
    httpOnly?: boolean      // Default: true
    secure?: boolean        // Default: true in production
    sameSite?: 'lax' | 'strict' | 'none'
    maxAge?: number         // Seconds
  }
}

interface Session<T> {
  data: T                   // Current session data
  update(data: Partial<T>): Promise<void>
  clear(): Promise<void>
}

// Password hashing
bcrypt.hash(password, 12): Promise<string>
bcrypt.compare(input, hash): Promise<boolean>
```

## Detailed References

| Reference                  | When to Use                                       |
| -------------------------- | ------------------------------------------------- |
| `references/sessions.md`   | Session management, cookies, storage              |
| `references/strategies.md` | Auth strategies (credentials, OAuth, magic links) |
| `references/middleware.md` | Auth middleware for server functions              |
| `references/protected.md`  | Protected routes, beforeLoad guards with sessions |
