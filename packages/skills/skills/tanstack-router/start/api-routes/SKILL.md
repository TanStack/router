---
name: tanstack-start-api-routes
description: |
  API routes in TanStack Start.
  Use for REST endpoints, webhooks, server routes.
---

# API Routes

TanStack Start supports API routes for REST endpoints and webhooks using `createAPIFileRoute`.

## Common Patterns

### Pattern 1: Basic API Route

```tsx
// app/routes/api/health.ts
import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/health')({
  GET: async () => {
    return json({ status: 'ok', timestamp: Date.now() })
  },
})
```

### Pattern 2: CRUD API with Multiple Methods

```tsx
// app/routes/api/posts.ts
import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { db } from '../../utils/db'

export const APIRoute = createAPIFileRoute('/api/posts')({
  GET: async ({ request }) => {
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '10')
    const posts = await db.post.findMany({ take: limit })
    return json(posts)
  },

  POST: async ({ request }) => {
    const body = await request.json()
    const post = await db.post.create({ data: body })
    return json(post, { status: 201 })
  },
})
```

### Pattern 3: Dynamic Route Parameters

```tsx
// app/routes/api/posts/$postId.ts
import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'

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

### Pattern 4: Webhook Handler with Signature Verification

```tsx
// app/routes/api/webhooks/stripe.ts
import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export const APIRoute = createAPIFileRoute('/api/webhooks/stripe')({
  POST: async ({ request }) => {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')!

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!,
      )
    } catch (err) {
      return json({ error: 'Invalid signature' }, { status: 400 })
    }

    switch (event.type) {
      case 'checkout.session.completed':
        // Handle successful checkout
        break
      case 'customer.subscription.deleted':
        // Handle subscription cancellation
        break
    }

    return json({ received: true })
  },
})
```

### Pattern 5: Protected API Route with Auth

```tsx
// app/routes/api/admin/users.ts
import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { useAppSession } from '../../../utils/session'

export const APIRoute = createAPIFileRoute('/api/admin/users')({
  GET: async () => {
    const session = await useAppSession()
    if (session.data.role !== 'admin') {
      return json({ error: 'Unauthorized' }, { status: 403 })
    }

    const users = await db.user.findMany({
      select: { id: true, email: true, role: true },
    })
    return json(users)
  },
})
```

### Pattern 6: Custom Response Headers

```tsx
export const APIRoute = createAPIFileRoute('/api/data')({
  GET: async () => {
    const data = await fetchData()

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'X-Custom-Header': 'value',
      },
    })
  },
})
```

## API Quick Reference

```tsx
import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'

// Create API route
createAPIFileRoute('/api/path')({
  GET: async (ctx) => Response,
  POST: async (ctx) => Response,
  PUT: async (ctx) => Response,
  DELETE: async (ctx) => Response,
  PATCH: async (ctx) => Response,
})

// Route context
interface APIRouteContext {
  request: Request         // Standard Request object
  params: Record<string, string>  // URL parameters
}

// Response helpers
json(data, init?): Response
json(data, { status: 201 })
json(data, { headers: { 'X-Custom': 'value' } })

// File naming for dynamic routes
/api/posts.ts           → /api/posts
/api/posts/$postId.ts   → /api/posts/:postId
/api/users/$userId/posts.ts → /api/users/:userId/posts
```

## Detailed References

| Reference                  | When to Use                                        |
| -------------------------- | -------------------------------------------------- |
| `references/basics.md`     | createAPIFileRoute, HTTP methods, request/response |
| `references/validation.md` | Request validation, error responses                |
| `references/webhooks.md`   | Webhook handlers, signature verification           |
