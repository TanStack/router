# Auth Middleware

Reusable authentication middleware for server functions.

## Basic Auth Middleware

```tsx
import { createMiddleware } from '@tanstack/start'
import { useSession } from 'vinxi/http'

const authMiddleware = createMiddleware().server(async ({ next }) => {
  const session = await useSession<{ userId: string | null }>({
    password: process.env.SESSION_SECRET!,
  })

  if (!session.data.userId) {
    throw new Error('Unauthorized')
  }

  const user = await db.user.findUnique({
    where: { id: session.data.userId },
  })

  if (!user) {
    throw new Error('User not found')
  }

  return next({ context: { user } })
})
```

## Using Auth Middleware

```tsx
const getProfile = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    // context.user is typed and available
    return {
      name: context.user.name,
      email: context.user.email,
    }
  })

const updateProfile = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ name: z.string() }))
  .handler(async ({ context, data }) => {
    await db.user.update({
      where: { id: context.user.id },
      data: { name: data.name },
    })
    return { success: true }
  })
```

## Role-Based Middleware

```tsx
const adminMiddleware = createMiddleware()
  .middleware([authMiddleware]) // Chain with auth
  .server(async ({ next, context }) => {
    if (context.user.role !== 'admin') {
      throw new Error('Forbidden')
    }
    return next()
  })

const deleteUser = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .handler(async ({ data }) => {
    // Only admins can reach here
  })
```

## Optional Auth

```tsx
const optionalAuthMiddleware = createMiddleware().server(async ({ next }) => {
  const session = await useSession({ password: process.env.SESSION_SECRET! })

  let user = null
  if (session.data.userId) {
    user = await db.user.findUnique({ where: { id: session.data.userId } })
  }

  return next({ context: { user } })
})

const getPosts = createServerFn()
  .middleware([optionalAuthMiddleware])
  .handler(async ({ context }) => {
    // context.user is User | null
    const posts = await db.post.findMany()
    return posts.map((post) => ({
      ...post,
      canEdit: context.user?.id === post.authorId,
    }))
  })
```
