# Streaming SSR

Stream HTML and data to clients progressively.

## Streaming Handler

```tsx
// app/ssr.tsx
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/start/server'

export default createStartHandler({
  createRouter,
})(defaultStreamHandler) // Enables streaming by default
```

## Deferred Data

```tsx
import { defer } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => ({
    // Critical - included in initial HTML
    post: await fetchPost(params.postId),

    // Non-critical - streamed after initial render
    comments: defer(fetchComments(params.postId)),
    related: defer(fetchRelatedPosts(params.postId)),
  }),
})
```

## Await Component

```tsx
import { Await } from '@tanstack/react-router'

function PostPage() {
  const { post, comments, related } = Route.useLoaderData()

  return (
    <article>
      {/* Renders immediately */}
      <h1>{post.title}</h1>
      <p>{post.content}</p>

      {/* Streams in when ready */}
      <Await promise={comments} fallback={<CommentsSkeleton />}>
        {(comments) => <Comments data={comments} />}
      </Await>

      <Await promise={related} fallback={<RelatedSkeleton />}>
        {(posts) => <RelatedPosts data={posts} />}
      </Await>
    </article>
  )
}
```

## Suspense Boundaries

```tsx
function PostPage() {
  return (
    <div>
      <Suspense fallback={<HeaderSkeleton />}>
        <Header />
      </Suspense>

      <Suspense fallback={<ContentSkeleton />}>
        <Content />
      </Suspense>

      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>
    </div>
  )
}
```

## Benefits

- **Faster TTFB**: Initial HTML sent immediately
- **Progressive loading**: Non-critical data streams in
- **Better UX**: Users see content sooner
- **SEO-friendly**: Critical content in initial HTML
