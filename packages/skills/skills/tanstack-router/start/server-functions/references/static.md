# Static Server Functions

Server functions that run at build time.

## Basic Static Server Function

```tsx
import { createServerFn } from '@tanstack/start'

const getStaticPosts = createServerFn().handler(async () => {
  // Runs at build time for static routes
  return db.post.findMany({ where: { published: true } })
})

export const Route = createFileRoute('/blog')({
  staticData: true, // Mark as static
  loader: () => getStaticPosts(),
})
```

## Build-Time vs Runtime

| Static Server Function   | Regular Server Function |
| ------------------------ | ----------------------- |
| Runs at build time       | Runs on each request    |
| Result cached in bundle  | Result fetched live     |
| No runtime server needed | Requires server         |
| Data frozen at build     | Data always fresh       |

## Static Paths Generation

```tsx
// Generate static pages for all posts
export const Route = createFileRoute('/blog/$slug')({
  staticData: true,
  loader: async ({ params }) => {
    return getPost(params.slug)
  },
})

// Define which paths to generate
export const staticParams = async () => {
  const posts = await getAllPosts()
  return posts.map((post) => ({ slug: post.slug }))
}
```

## Incremental Static Regeneration

```tsx
export const Route = createFileRoute('/blog/$slug')({
  staticData: {
    revalidate: 3600, // Regenerate every hour
  },
  loader: async ({ params }) => getPost(params.slug),
})
```

## Mixed Static and Dynamic

```tsx
// Static: list of posts
export const Route = createFileRoute('/blog')({
  staticData: true,
  loader: () => getPublishedPosts(),
})

// Dynamic: individual post with comments
export const Route = createFileRoute('/blog/$slug')({
  // Not static - fetches fresh data
  loader: async ({ params }) => ({
    post: await getPost(params.slug),
    comments: await getComments(params.slug), // Live data
  }),
})
```

## When to Use Static

**Good for static:**

- Blog posts
- Documentation
- Marketing pages
- Product catalogs (stable)

**Not for static:**

- User-specific data
- Real-time data
- Frequently changing content
- Authenticated content
