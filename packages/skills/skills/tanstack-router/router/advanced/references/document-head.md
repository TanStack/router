# Document Head

Manage page title, meta tags, and other head elements.

## useHead Hook

```tsx
import { useHead } from '@tanstack/react-router'

function PostPage() {
  const { post } = Route.useLoaderData()

  useHead({
    title: post.title,
    meta: [
      { name: 'description', content: post.excerpt },
      { property: 'og:title', content: post.title },
      { property: 'og:image', content: post.coverImage },
    ],
  })

  return <article>{post.content}</article>
}
```

## Route-Level Head

```tsx
export const Route = createFileRoute('/about')({
  head: () => ({
    title: 'About Us',
    meta: [{ name: 'description', content: 'Learn about our company' }],
  }),
})
```

## Dynamic Head from Loader

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => fetchPost(params.postId),
  head: ({ loaderData }) => ({
    title: loaderData.title,
    meta: [{ name: 'description', content: loaderData.excerpt }],
  }),
})
```

## Link Tags

```tsx
useHead({
  title: 'My Page',
  links: [
    { rel: 'canonical', href: 'https://example.com/page' },
    { rel: 'icon', href: '/favicon.ico' },
  ],
})
```

## Scripts

```tsx
useHead({
  scripts: [{ src: 'https://analytics.example.com/script.js', async: true }],
})
```

## Nested Head Tags

Head tags from child routes override parent routes:

```tsx
// Root: title = "My App"
// /posts: title = "Posts | My App"
// /posts/123: title = "Post Title | My App"
```

## SSR Considerations

For proper SSR head management, use TanStack Start which handles head tags during server rendering.
