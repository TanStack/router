# API Route Basics

Creating REST endpoints with TanStack Start.

## Basic API Route

```tsx
// app/routes/api/hello.ts
import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'

export const APIRoute = createAPIFileRoute('/api/hello')({
  GET: async () => {
    return json({ message: 'Hello, World!' })
  },
})
```

## HTTP Methods

```tsx
// app/routes/api/posts.ts
export const APIRoute = createAPIFileRoute('/api/posts')({
  GET: async () => {
    const posts = await db.post.findMany()
    return json(posts)
  },

  POST: async ({ request }) => {
    const body = await request.json()
    const post = await db.post.create({ data: body })
    return json(post, { status: 201 })
  },
})
```

## Dynamic Routes

```tsx
// app/routes/api/posts/$postId.ts
export const APIRoute = createAPIFileRoute('/api/posts/$postId')({
  GET: async ({ params }) => {
    const post = await db.post.findUnique({
      where: { id: params.postId },
    })

    if (!post) {
      return json({ error: 'Not found' }, { status: 404 })
    }

    return json(post)
  },

  PUT: async ({ request, params }) => {
    const body = await request.json()
    const post = await db.post.update({
      where: { id: params.postId },
      data: body,
    })
    return json(post)
  },

  DELETE: async ({ params }) => {
    await db.post.delete({ where: { id: params.postId } })
    return json({ success: true })
  },
})
```

## Request Object

```tsx
GET: async ({ request }) => {
  // URL and search params
  const url = new URL(request.url)
  const page = url.searchParams.get('page') || '1'

  // Headers
  const auth = request.headers.get('authorization')

  // Method
  console.log(request.method) // 'GET'

  return json({ page, hasAuth: !!auth })
}
```

## Response Helpers

```tsx
import { json } from '@tanstack/start'

// JSON response
return json({ data: 'value' })

// With status
return json({ error: 'Not found' }, { status: 404 })

// With headers
return json(
  { data: 'value' },
  {
    headers: {
      'Cache-Control': 'max-age=3600',
      'X-Custom-Header': 'value',
    },
  },
)

// Raw Response
return new Response('Plain text', {
  headers: { 'Content-Type': 'text/plain' },
})
```
