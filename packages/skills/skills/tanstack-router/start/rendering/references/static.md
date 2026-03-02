# Static Generation

Pre-render pages at build time.

## Static Routes

```tsx
export const Route = createFileRoute('/about')({
  // Mark as static
  staticData: true,
  loader: async () => ({
    content: await getAboutContent(),
  }),
})
```

## Static with Dynamic Paths

```tsx
// Generate pages for all posts at build time
export const Route = createFileRoute('/posts/$postId')({
  staticData: true,
  loader: async ({ params }) => ({
    post: await fetchPost(params.postId),
  }),
})

// Specify which paths to generate
export const staticParams = async () => {
  const posts = await getAllPosts()
  return posts.map((post) => ({ postId: post.id }))
}
```

## Incremental Static Regeneration (ISR)

```tsx
export const Route = createFileRoute('/posts/$postId')({
  staticData: {
    revalidate: 60, // Revalidate every 60 seconds
  },
  loader: async ({ params }) => ({
    post: await fetchPost(params.postId),
  }),
})
```

## Configuration

```ts
// app.config.ts
export default defineConfig({
  server: {
    preset: 'vercel',
    static: {
      // Paths to pre-render
      paths: ['/about', '/contact', '/pricing'],
    },
  },
})
```

## On-Demand Revalidation

```tsx
// API route to trigger revalidation
export const APIRoute = createAPIFileRoute('/api/revalidate')({
  POST: async ({ request }) => {
    const { path, secret } = await request.json()

    if (secret !== process.env.REVALIDATE_SECRET) {
      return json({ error: 'Invalid secret' }, { status: 401 })
    }

    await revalidatePath(path)
    return json({ revalidated: true })
  },
})
```

## When to Use Static

- Marketing pages
- Blog posts
- Documentation
- Product pages
- Any content that changes infrequently
