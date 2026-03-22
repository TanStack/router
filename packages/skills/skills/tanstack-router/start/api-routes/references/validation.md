# API Request Validation

Validate incoming API requests.

## Manual Validation

```tsx
import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'
import { z } from 'zod'

const createPostSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
  published: z.boolean().default(false),
})

export const APIRoute = createAPIFileRoute('/api/posts')({
  POST: async ({ request }) => {
    const body = await request.json()

    const result = createPostSchema.safeParse(body)

    if (!result.success) {
      return json(
        {
          error: 'Validation failed',
          issues: result.error.issues,
        },
        { status: 400 },
      )
    }

    const post = await db.post.create({ data: result.data })
    return json(post, { status: 201 })
  },
})
```

## Query Parameter Validation

```tsx
const listPostsSchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().max(100).default(20),
  sort: z.enum(['date', 'title']).default('date'),
})

export const APIRoute = createAPIFileRoute('/api/posts')({
  GET: async ({ request }) => {
    const url = new URL(request.url)
    const params = Object.fromEntries(url.searchParams)

    const result = listPostsSchema.safeParse(params)

    if (!result.success) {
      return json({ error: result.error.issues }, { status: 400 })
    }

    const { page, limit, sort } = result.data
    const posts = await db.post.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sort === 'title' ? 'title' : 'createdAt']: 'desc' },
    })

    return json({ posts, page, limit })
  },
})
```

## Error Responses

```tsx
function errorResponse(message: string, status: number, details?: unknown) {
  return json(
    {
      error: message,
      status,
      timestamp: new Date().toISOString(),
      ...(details && { details }),
    },
    { status },
  )
}

// Usage
if (!post) {
  return errorResponse('Post not found', 404)
}

if (!result.success) {
  return errorResponse('Validation failed', 400, result.error.issues)
}
```

## Type-Safe Handlers

```tsx
type PostInput = z.infer<typeof createPostSchema>

async function createPost(data: PostInput) {
  return db.post.create({ data })
}
```
