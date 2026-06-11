---
name: tanstack-start-data
description: |
  Server-side data patterns in TanStack Start.
  Use for database access, environment variables, server-side data management.
---

# Data

Patterns for server-side data access in TanStack Start.

## Common Patterns

### Pattern 1: Basic Database Query

```tsx
import { createServerFn } from '@tanstack/react-start'
import { db } from './db'

export const getPosts = createServerFn({ method: 'GET' }).handler(async () => {
  // Direct database access - only runs on server
  return db.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
})
```

### Pattern 2: Database Query with Parameters

```tsx
export const getPostById = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: postId }) => {
    const post = await db.post.findUnique({
      where: { id: postId },
      include: { author: true },
    })
    if (!post) throw new Error('Post not found')
    return post
  })
```

### Pattern 3: Server-Only Environment Variables

```tsx
// Server function - safe for secrets
const apiKey = process.env.API_SECRET_KEY
const databaseUrl = process.env.DATABASE_URL

export const callExternalAPI = createServerFn({ method: 'GET' }).handler(
  async () => {
    const response = await fetch('https://api.example.com/data', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return response.json()
  },
)
```

### Pattern 4: Client-Safe Environment Variables

```tsx
// vite.config.ts - expose public values only
export default defineConfig({
  define: {
    'import.meta.env.VITE_PUBLIC_API_URL': JSON.stringify(
      process.env.PUBLIC_API_URL,
    ),
  },
})

// Client code - can access VITE_ prefixed vars
const apiUrl = import.meta.env.VITE_PUBLIC_API_URL
```

### Pattern 5: Database Create/Update

```tsx
export const createPost = createServerFn({ method: 'POST' })
  .validator((data: { title: string; content: string }) => data)
  .handler(async ({ data }) => {
    return db.post.create({
      data: {
        title: data.title,
        content: data.content,
        createdAt: new Date(),
      },
    })
  })
```

### Pattern 6: Using Data in Route Loaders

```tsx
// app/routes/posts.tsx
import { createFileRoute } from '@tanstack/react-router'
import { getPosts } from '../utils/data'

export const Route = createFileRoute('/posts')({
  loader: async () => {
    const posts = await getPosts()
    return { posts }
  },
  component: PostsList,
})

function PostsList() {
  const { posts } = Route.useLoaderData()
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

## API Quick Reference

```tsx
import { createServerFn } from '@tanstack/react-start'

// Server function with database access
createServerFn({ method: 'GET' | 'POST' })
  .validator((input: T) => T) // Optional input validation
  .handler(async ({ data }) => {
    // data is the validated input
    // process.env.* available here (server only)
    return result
  })

// Environment variable patterns
process.env.SECRET_KEY // Server only - safe for secrets
import.meta.env.VITE_PUBLIC_KEY // Client accessible - public only

// Common database patterns
db.model.findMany({ where, orderBy, take, skip, include })
db.model.findUnique({ where, include })
db.model.create({ data })
db.model.update({ where, data })
db.model.delete({ where })
```

## Detailed References

| Reference                   | When to Use                                   |
| --------------------------- | --------------------------------------------- |
| `references/database.md`    | Database setup, ORMs, connection patterns     |
| `references/environment.md` | Environment variables, secrets, configuration |
| `references/caching.md`     | Server-side caching, Redis, in-memory cache   |
