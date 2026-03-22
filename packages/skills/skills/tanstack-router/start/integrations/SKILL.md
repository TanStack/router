---
name: start-integrations
description: |
  Integrating TanStack Start with databases, authentication providers, and external services.
  Covers Neon, Convex, Prisma, Clerk, Supabase, and more.
---

# Integrations

TanStack Start integrations with databases, auth providers, and external services.

## Common Patterns

### Pattern 1: Generic Integration Pattern

All integrations follow the same pattern - call services from server functions:

```tsx
import { createServerFn } from '@tanstack/react-start'

const service = createServiceClient({
  apiKey: process.env.SERVICE_API_KEY, // Server-only secret
})

export const getData = createServerFn({ method: 'GET' }).handler(async () => {
  return service.query()
})

export const mutateData = createServerFn({ method: 'POST' })
  .validator((data: InputType) => data)
  .handler(async ({ data }) => {
    return service.mutate(data)
  })
```

### Pattern 2: Database Integration (Neon/Prisma/Drizzle)

```tsx
// app/utils/db.ts
import { neon } from '@neondatabase/serverless'
// or: import { PrismaClient } from '@prisma/client'
// or: import { drizzle } from 'drizzle-orm/neon-http'

export const sql = neon(process.env.DATABASE_URL!)

// app/utils/posts.ts
import { createServerFn } from '@tanstack/react-start'
import { sql } from './db'

export const getPosts = createServerFn({ method: 'GET' }).handler(async () => {
  return sql`SELECT * FROM posts ORDER BY created_at DESC LIMIT 10`
})
```

### Pattern 3: Auth Provider Integration (Clerk)

```tsx
// app/utils/auth.ts
import { createServerFn } from '@tanstack/react-start'
import { getAuth } from '@clerk/tanstack-start/server'
import { getWebRequest } from '@tanstack/react-start/server'

export const getCurrentUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    const request = getWebRequest()
    const auth = await getAuth(request)
    return auth.userId ? { userId: auth.userId } : null
  },
)
```

### Pattern 4: React Query Integration

```tsx
// app/routes/posts.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getPosts } from '../utils/posts'

export const Route = createFileRoute('/posts')({
  loader: async ({ context }) => {
    // Prefetch on server
    await context.queryClient.ensureQueryData({
      queryKey: ['posts'],
      queryFn: () => getPosts(),
    })
  },
  component: PostsList,
})

function PostsList() {
  const { data: posts } = useSuspenseQuery({
    queryKey: ['posts'],
    queryFn: () => getPosts(),
  })
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id}>{p.title}</li>
      ))}
    </ul>
  )
}
```

### Pattern 5: Email Service Integration (Resend)

```tsx
import { createServerFn } from '@tanstack/react-start'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export const sendEmail = createServerFn({ method: 'POST' })
  .validator((data: { to: string; subject: string; html: string }) => data)
  .handler(async ({ data }) => {
    return resend.emails.send({
      from: 'noreply@example.com',
      to: data.to,
      subject: data.subject,
      html: data.html,
    })
  })
```

### Pattern 6: Environment Variables Pattern

```tsx
// Server-side secrets (never exposed)
const dbUrl = process.env.DATABASE_URL
const apiKey = process.env.API_SECRET_KEY

// Client-side (must use VITE_ prefix)
const publicKey = import.meta.env.VITE_PUBLIC_KEY
```

## API Quick Reference

```tsx
// Generic pattern for all integrations
import { createServerFn } from '@tanstack/react-start'

// Server function wraps external service calls
createServerFn({ method: 'GET' | 'POST' })
  .validator((input) => validatedInput)
  .handler(async ({ data }) => {
    // Access process.env.* for secrets
    // Call external services
    return result
  })

// Popular integrations
// Databases: @neondatabase/serverless, @prisma/client, drizzle-orm
// Auth: @clerk/tanstack-start, @supabase/supabase-js, better-auth
// Email: resend, @sendgrid/mail
// Payments: stripe
```

## Detailed References

| Reference                      | When to Use                                  |
| ------------------------------ | -------------------------------------------- |
| `references/databases.md`      | Neon, Convex, Prisma, Drizzle integration    |
| `references/auth-providers.md` | Clerk, Supabase, WorkOS, Auth.js integration |
| `references/react-query.md`    | TanStack Query with server functions         |
| `references/email.md`          | Resend, SendGrid, email integration          |
