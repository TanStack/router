# Render Optimization

Performance optimizations for route rendering.

## Structural Sharing

Router uses structural sharing to minimize re-renders:

```tsx
// Only changed parts trigger re-renders
const { data } = Route.useLoaderData()
// If data.posts changes but data.meta doesn't,
// components using only data.meta won't re-render
```

## Fine-Grained Subscriptions

Select specific data to minimize updates:

```tsx
function PostCount() {
  // Only re-renders when count changes
  const count = Route.useLoaderData({
    select: (data) => data.posts.length,
  })

  return <span>{count} posts</span>
}
```

## useMatch with Select

```tsx
function UserName() {
  const userName = useMatch({
    from: '/users/$userId',
    select: (match) => match.loaderData.user.name,
  })

  return <span>{userName}</span>
}
```

## Avoiding Unnecessary Re-renders

```tsx
// ❌ Bad - new object every render
<Link to="/posts" search={{ page: 1 }}>Posts</Link>

// ✅ Good - stable reference
const searchParams = useMemo(() => ({ page: 1 }), [])
<Link to="/posts" search={searchParams}>Posts</Link>

// ✅ Or use function form
<Link to="/posts" search={(prev) => ({ ...prev, page: 1 })}>Posts</Link>
```

## Component Memoization

```tsx
const PostItem = memo(function PostItem({ post }) {
  return <li>{post.title}</li>
})

function PostList() {
  const { posts } = Route.useLoaderData()

  return (
    <ul>
      {posts.map((post) => (
        <PostItem key={post.id} post={post} />
      ))}
    </ul>
  )
}
```

## Pending States

Avoid layout shifts during navigation:

```tsx
export const Route = createFileRoute('/posts')({
  pendingComponent: () => <PostsSkeleton />,
  pendingMinMs: 200, // Don't flash loading for fast loads
  pendingMs: 0, // Show pending immediately
})
```
