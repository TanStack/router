# Session Management

Server-side session handling.

## Basic Sessions

```tsx
import { createServerFn } from '@tanstack/start'
import { useSession } from 'vinxi/http'

interface SessionData {
  userId: string | null
  cart: string[]
}

const getSession = createServerFn().handler(async () => {
  const session = await useSession<SessionData>({
    password: process.env.SESSION_SECRET!,
  })
  return session.data
})

const updateSession = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    const session = await useSession<SessionData>({
      password: process.env.SESSION_SECRET!,
    })
    await session.update({ userId: data.userId })
    return { success: true }
  })
```

## Session Options

```tsx
const session = await useSession<SessionData>({
  password: process.env.SESSION_SECRET!, // Min 32 chars
  name: 'my-app-session', // Cookie name
  maxAge: 60 * 60 * 24 * 7, // 1 week
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
})
```

## Clear Session

```tsx
const logout = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await useSession<SessionData>({
    password: process.env.SESSION_SECRET!,
  })
  await session.clear()
  return { success: true }
})
```

## Session in Route Guards

```tsx
export const Route = createFileRoute('/_auth')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session.userId) {
      throw redirect({ to: '/login' })
    }
    return { userId: session.userId }
  },
})
```

## Session Secret

```bash
# Generate secure secret
openssl rand -base64 32

# .env
SESSION_SECRET=your-32-character-or-longer-secret
```
