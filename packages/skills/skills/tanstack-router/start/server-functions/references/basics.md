# Server Function Basics

Core patterns for createServerFn.

## Creating Server Functions

```tsx
import { createServerFn } from '@tanstack/start'

// GET request (default)
const getData = createServerFn({ method: 'GET' }).handler(async () => {
  return { message: 'Hello from server' }
})

// POST request
const createItem = createServerFn({ method: 'POST' }).handler(async () => {
  // Handle creation
})
```

## With Input

```tsx
const getUser = createServerFn({ method: 'GET' }).handler(async ({ data }) => {
  // data is the input passed when calling
  return db.user.findUnique({ where: { id: data.userId } })
})

// Usage
const user = await getUser({ data: { userId: '123' } })
```

## In Route Loaders

```tsx
const getPosts = createServerFn({ method: 'GET' }).handler(async () => {
  return db.post.findMany()
})

export const Route = createFileRoute('/posts')({
  loader: async () => {
    const posts = await getPosts()
    return { posts }
  },
})
```

## In Components

```tsx
function CreatePostForm() {
  const handleSubmit = async (formData: FormData) => {
    const result = await createPost({
      data: {
        title: formData.get('title') as string,
        content: formData.get('content') as string,
      },
    })
    // Handle result
  }
}
```

## Return Types

```tsx
// JSON (default)
const getData = createServerFn().handler(async () => {
  return { data: 'value' } // Serialized as JSON
})

// Redirect
import { redirect } from '@tanstack/react-router'

const loginAction = createServerFn({ method: 'POST' }).handler(async () => {
  // ... login logic
  throw redirect({ to: '/dashboard' })
})
```

## Error Handling

```tsx
const riskyOperation = createServerFn().handler(async () => {
  try {
    return await performOperation()
  } catch (error) {
    throw new Error('Operation failed')
  }
})
```
