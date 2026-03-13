---
name: start-core/server-functions
description: >-
  createServerFn (GET/POST), inputValidator (Zod or function),
  useServerFn hook, server context utilities (getRequest,
  getRequestHeader, setResponseHeader, setResponseStatus), error
  handling (throw errors, redirect, notFound), streaming, FormData
  handling, file organization (.functions.ts, .server.ts).
type: sub-skill
library: tanstack-start
library_version: '1.166.2'
requires:
  - start-core
sources:
  - TanStack/router:docs/start/framework/react/guide/server-functions.md
---

# Server Functions

Server functions are type-safe RPCs created with `createServerFn`. They run exclusively on the server but can be called from anywhere — loaders, components, hooks, event handlers, or other server functions.

> **CRITICAL**: Loaders are ISOMORPHIC — they run on BOTH client and server. Database queries, file system access, and secret API keys MUST go inside `createServerFn`, NOT in loaders directly.
> **CRITICAL**: Do not use `"use server"` directives, `getServerSideProps`, or any Next.js/Remix server patterns. TanStack Start uses `createServerFn` exclusively.

## Basic Usage

```tsx
import { createServerFn } from '@tanstack/react-start'

// GET (default)
const getData = createServerFn().handler(async () => {
  return { message: 'Hello from server!' }
})

// POST
const saveData = createServerFn({ method: 'POST' }).handler(async () => {
  return { success: true }
})
```

## Calling from Loaders

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const getPosts = createServerFn({ method: 'GET' }).handler(async () => {
  const posts = await db.query('SELECT * FROM posts')
  return { posts }
})

export const Route = createFileRoute('/posts')({
  loader: () => getPosts(),
  component: PostList,
})

function PostList() {
  const { posts } = Route.useLoaderData()
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id}>{p.title}</li>
      ))}
    </ul>
  )
}
```

## Calling from Components

Use the `useServerFn` hook to call server functions from event handlers:

```tsx
import { useServerFn } from '@tanstack/react-start'

const deletePost = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await db.delete('posts').where({ id: data.id })
    return { success: true }
  })

function DeleteButton({ postId }: { postId: string }) {
  const deletePostFn = useServerFn(deletePost)

  return (
    <button onClick={() => deletePostFn({ data: { id: postId } })}>
      Delete
    </button>
  )
}
```

## Input Validation

### Basic Validator

```tsx
const greetUser = createServerFn({ method: 'GET' })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    return `Hello, ${data.name}!`
  })

await greetUser({ data: { name: 'John' } })
```

### Zod Validator

```tsx
import { z } from 'zod'

const createUser = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      name: z.string().min(1),
      age: z.number().min(0),
    }),
  )
  .handler(async ({ data }) => {
    return `Created user: ${data.name}, age ${data.age}`
  })
```

### FormData

```tsx
const submitForm = createServerFn({ method: 'POST' })
  .inputValidator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error('Expected FormData')
    }
    return {
      name: data.get('name')?.toString() || '',
      email: data.get('email')?.toString() || '',
    }
  })
  .handler(async ({ data }) => {
    return { success: true }
  })
```

## Error Handling

### Errors

```tsx
const riskyFunction = createServerFn().handler(async () => {
  throw new Error('Something went wrong!')
})

try {
  await riskyFunction()
} catch (error) {
  console.log(error.message) // "Something went wrong!"
}
```

### Redirects

```tsx
import { redirect } from '@tanstack/react-router'

const requireAuth = createServerFn().handler(async () => {
  const user = await getCurrentUser()
  if (!user) {
    throw redirect({ to: '/login' })
  }
  return user
})
```

### Not Found

```tsx
import { notFound } from '@tanstack/react-router'

const getPost = createServerFn()
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const post = await db.findPost(data.id)
    if (!post) {
      throw notFound()
    }
    return post
  })
```

## Server Context Utilities

Access request/response details inside server function handlers:

```tsx
import { createServerFn } from '@tanstack/react-start'
import {
  getRequest,
  getRequestHeader,
  setResponseHeaders,
  setResponseStatus,
} from '@tanstack/react-start/server'

const getCachedData = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const authHeader = getRequestHeader('Authorization')

  setResponseHeaders({
    'Cache-Control': 'public, max-age=300',
  })
  setResponseStatus(200)

  return fetchData()
})
```

Available utilities:

- `getRequest()` — full Request object
- `getRequestHeader(name)` — single request header
- `setResponseHeader(name, value)` — single response header
- `setResponseHeaders(headers)` — multiple response headers
- `setResponseStatus(code)` — HTTP status code

## File Organization

```text
src/utils/
├── users.functions.ts   # createServerFn wrappers (safe to import anywhere)
├── users.server.ts      # Server-only helpers (DB queries, internal logic)
└── schemas.ts           # Shared validation schemas (client-safe)
```

```tsx
// users.server.ts — server-only helpers
import { db } from '~/db'

export async function findUserById(id: string) {
  return db.query.users.findFirst({ where: eq(users.id, id) })
}
```

```tsx
// users.functions.ts — server functions
import { createServerFn } from '@tanstack/react-start'
import { findUserById } from './users.server'

export const getUser = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    return findUserById(data.id)
  })
```

Static imports of server functions are safe — the build replaces implementations with RPC stubs in client bundles.

## Common Mistakes

### 1. CRITICAL: Putting server-only code in loaders

```tsx
// WRONG — loader is ISOMORPHIC, runs on BOTH client and server
export const Route = createFileRoute('/posts')({
  loader: async () => {
    const posts = await db.query('SELECT * FROM posts')
    return { posts }
  },
})

// CORRECT — use createServerFn for server-only logic
const getPosts = createServerFn({ method: 'GET' }).handler(async () => {
  const posts = await db.query('SELECT * FROM posts')
  return { posts }
})

export const Route = createFileRoute('/posts')({
  loader: () => getPosts(),
})
```

### 2. CRITICAL: Using Next.js/Remix server patterns

```tsx
// WRONG — "use server" is a React directive, not used in TanStack Start
'use server'
export async function getUser() { ... }

// WRONG — getServerSideProps is Next.js
export async function getServerSideProps() { ... }

// CORRECT — TanStack Start uses createServerFn
const getUser = createServerFn({ method: 'GET' })
  .handler(async () => { ... })
```

### 3. HIGH: Dynamic imports for server functions

```tsx
// WRONG — can cause bundler issues
const { getUser } = await import('~/utils/users.functions')

// CORRECT — static imports are safe, build handles environment shaking
import { getUser } from '~/utils/users.functions'
```

### 4. HIGH: Awaiting server function without calling it

`createServerFn` returns a function — it must be invoked with `()`:

```tsx
// WRONG — getItems is a function, not a Promise
const data = await getItems

// CORRECT — call the function
const data = await getItems()

// With validated input
const data = await getItems({ data: { id: '1' } })
```

### 5. MEDIUM: Not using useServerFn for component calls

When calling server functions from event handlers in components, use `useServerFn` to get proper React integration:

```tsx
// WRONG — direct call doesn't integrate with React lifecycle
<button onClick={() => deletePost({ data: { id } })}>Delete</button>

// CORRECT — useServerFn integrates with React
const deletePostFn = useServerFn(deletePost)
<button onClick={() => deletePostFn({ data: { id } })}>Delete</button>
```

## Cross-References

- [start-core/execution-model](../execution-model/SKILL.md) — understanding where code runs
- [start-core/middleware](../middleware/SKILL.md) — composing server functions with middleware
