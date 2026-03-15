---
name: tanstack-start-server-functions
description: |
  Server functions in TanStack Start.
  Use for createServerFn, server-side logic, middleware, input validation.
---

# Server Functions

Server functions run exclusively on the server and can be called from client components or route loaders. They're the primary way to interact with databases, APIs, and secrets.

## Common Patterns

### Basic Server Function

```tsx
import { createServerFn } from '@tanstack/react-start'

// GET request (default)
export const getUsers = createServerFn().handler(async () => {
  return db.query.users.findMany()
})

// POST request for mutations
export const createUser = createServerFn({ method: 'POST' }).handler(
  async () => {
    return db.insert(users).values({ name: 'New User' })
  },
)
```

### Input Validation with Zod

```tsx
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  published: z.boolean().default(false),
})

export const createPost = createServerFn({ method: 'POST' })
  .validator(createPostSchema)
  .handler(async ({ data }) => {
    // data is typed: { title: string; content: string; published: boolean }
    return db.insert(posts).values(data).returning()
  })

// Usage
await createPost({ data: { title: 'Hello', content: 'World' } })
```

### Server Function with Parameters

```tsx
export const getPost = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, data.id),
    })
    if (!post) throw new Error('Post not found')
    return post
  })

// Usage
const post = await getPost({ data: { id: '123' } })
```

### Using in Route Loaders

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { getPost, getComments } from '../server/posts'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const [post, comments] = await Promise.all([
      getPost({ data: { id: params.postId } }),
      getComments({ data: { postId: params.postId } }),
    ])
    return { post, comments }
  },
})
```

### Using in Components

```tsx
import { getUsers, createUser } from '../server/users'

function UserList() {
  const [users, setUsers] = useState([])

  useEffect(() => {
    getUsers().then(setUsers)
  }, [])

  const handleCreate = async () => {
    const newUser = await createUser({
      data: { name: 'John', email: 'john@example.com' },
    })
    setUsers((prev) => [...prev, newUser])
  }

  return (
    <div>
      {users.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
      <button onClick={handleCreate}>Add User</button>
    </div>
  )
}
```

### Accessing Request Context

```tsx
import { createServerFn } from '@tanstack/react-start'
import { getWebRequest } from '@tanstack/react-start/server'

export const getCurrentUser = createServerFn().handler(async () => {
  const request = getWebRequest()

  // Access headers
  const authHeader = request.headers.get('authorization')

  // Access cookies
  const cookies = request.headers.get('cookie')

  // Your auth logic
  const user = await validateToken(authHeader)
  return user
})
```

### Middleware Pattern

```tsx
import { createServerFn } from '@tanstack/react-start'
import { useAppSession } from '../utils/session'

// Auth middleware as a server function
const requireAuth = createServerFn().handler(async () => {
  const session = await useAppSession()
  if (!session.data.userId) {
    throw new Error('Unauthorized')
  }
  return session.data
})

// Protected server function
export const getPrivateData = createServerFn().handler(async () => {
  const { userId } = await requireAuth() // Throws if not authenticated
  return db.query.privateData.findMany({
    where: eq(privateData.userId, userId),
  })
})
```

### Error Handling

```tsx
export const updatePost = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string(),
      title: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const [updated] = await db
        .update(posts)
        .set({ title: data.title })
        .where(eq(posts.id, data.id))
        .returning()

      if (!updated) {
        return { success: false, error: 'Post not found' }
      }

      return { success: true, post: updated }
    } catch (error) {
      console.error('Update failed:', error)
      return { success: false, error: 'Update failed' }
    }
  })

// Client usage with error handling
const result = await updatePost({ data: { id: '123', title: 'New Title' } })
if (!result.success) {
  showError(result.error)
}
```

## API Quick Reference

```tsx
// Create server function
createServerFn({ method?: 'GET' | 'POST' })
  .validator(zodSchema)     // Optional validation
  .handler(async ({ data, request? }) => result)

// Access web request
import { getWebRequest } from '@tanstack/react-start/server'
const request = getWebRequest()

// Session access
import { useSession } from '@tanstack/react-start/server'
const session = await useSession({ password: '...' })

// Common patterns
export const getFn = createServerFn().handler(handler)           // GET
export const postFn = createServerFn({ method: 'POST' }).handler(handler)  // POST
export const validatedFn = createServerFn()
  .validator(schema)
  .handler(({ data }) => ...)  // With validation
```

## Detailed References

| Reference                       | When to Use                                       |
| ------------------------------- | ------------------------------------------------- |
| `references/basics.md`          | createServerFn syntax, methods, return types      |
| `references/validation.md`      | Input validation with Zod/Valibot, error handling |
| `references/middleware.md`      | Middleware patterns, auth checks, logging         |
| `references/context.md`         | Request context, headers, cookies, web request    |
| `references/streaming.md`       | Streaming responses from server functions         |
| `references/execution-model.md` | How server functions execute, RPC behavior        |
| `references/static.md`          | Static server functions, build-time execution     |
