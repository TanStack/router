# Server-Side Caching

Caching patterns for server functions.

## In-Memory Cache

```tsx
import { createServerFn } from '@tanstack/start'

const cache = new Map<string, { data: unknown; expires: number }>()

function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const entry = cache.get(key)

  if (entry && entry.expires > now) {
    return entry.data as Promise<T>
  }

  const promise = fn()
  promise.then((data) => {
    cache.set(key, { data, expires: now + ttl })
  })

  return promise
}

const getPopularPosts = createServerFn().handler(async () => {
  return cached('popular-posts', 60_000, async () => {
    return db.post.findMany({
      orderBy: { views: 'desc' },
      take: 10,
    })
  })
})
```

## Redis Cache

```tsx
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.REDIS_URL!,
  token: process.env.REDIS_TOKEN!,
})

const getCachedData = createServerFn()
  .validator(z.object({ key: z.string() }))
  .handler(async ({ data }) => {
    // Try cache first
    const cached = await redis.get(data.key)
    if (cached) return cached

    // Fetch and cache
    const result = await fetchExpensiveData(data.key)
    await redis.set(data.key, result, { ex: 3600 }) // 1 hour

    return result
  })
```

## Cache Invalidation

```tsx
const updatePost = createServerFn({ method: 'POST' }).handler(
  async ({ data }) => {
    const post = await db.post.update({
      where: { id: data.id },
      data: { title: data.title },
    })

    // Invalidate related caches
    cache.delete(`post:${data.id}`)
    cache.delete('popular-posts')

    return post
  },
)
```

## HTTP Cache Headers

```tsx
import { setResponseHeader } from 'vinxi/http'

const getStaticData = createServerFn().handler(async () => {
  setResponseHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
  return { data: 'rarely changes' }
})
```

## Stale-While-Revalidate

```tsx
const getData = createServerFn().handler(async () => {
  setResponseHeader(
    'Cache-Control',
    'public, max-age=60, stale-while-revalidate=300',
  )
  return fetchData()
})
```
