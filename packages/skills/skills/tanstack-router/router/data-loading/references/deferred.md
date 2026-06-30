# Deferred Data Loading

Stream non-critical data after initial render.

## defer() Function

```tsx
import { defer } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    // Critical - wait for this
    const post = await fetchPost(params.postId)

    // Non-critical - stream later
    const comments = fetchComments(params.postId)

    return {
      post,
      comments: defer(comments),
    }
  },
})
```

## Await Component

```tsx
import { Await } from '@tanstack/react-router'

function PostComponent() {
  const { post, comments } = Route.useLoaderData()

  return (
    <article>
      <h1>{post.title}</h1>

      <Await promise={comments} fallback={<div>Loading comments...</div>}>
        {(resolvedComments) => (
          <ul>
            {resolvedComments.map((c) => (
              <li key={c.id}>{c.text}</li>
            ))}
          </ul>
        )}
      </Await>
    </article>
  )
}
```

## Error Handling

```tsx
<Await
  promise={comments}
  fallback={<div>Loading...</div>}
  errorComponent={({ error }) => <div>Failed to load comments</div>}
>
  {(comments) => <CommentList comments={comments} />}
</Await>
```

## Multiple Deferred

```tsx
loader: async ({ params }) => {
  return {
    post: await fetchPost(params.postId),
    comments: defer(fetchComments(params.postId)),
    related: defer(fetchRelatedPosts(params.postId)),
    author: defer(fetchAuthor(params.postId)),
  }
}
```

## When to Defer

**Defer when:**

- Data is not critical for initial render
- Data is slow to fetch
- You want faster initial page load

**Don't defer when:**

- Data is required for meaningful render
- Data is fast to fetch
- SEO requires the data immediately
