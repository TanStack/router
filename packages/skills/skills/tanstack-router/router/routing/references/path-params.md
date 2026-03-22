# Path Parameters

Dynamic URL segments that capture values from the URL.

## Basic Usage

```tsx
// Route: /posts/$postId
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    // params.postId is typed as string
    return fetchPost(params.postId)
  },
  component: PostComponent,
})

function PostComponent() {
  const { postId } = Route.useParams()
  // postId is typed as string
}
```

## Multiple Params

```tsx
// Route: /users/$userId/posts/$postId
export const Route = createFileRoute('/users/$userId/posts/$postId')({
  loader: async ({ params }) => {
    // params: { userId: string, postId: string }
    return fetchUserPost(params.userId, params.postId)
  },
})
```

## Splat/Catch-All Routes

Capture remaining path segments:

```tsx
// Route: /files/$
// Matches: /files/a, /files/a/b/c, etc.
export const Route = createFileRoute('/files/$')({
  component: () => {
    const { _splat } = Route.useParams()
    // _splat: "a/b/c" for /files/a/b/c
  },
})
```

## Param Parsing

Transform params during parsing:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  params: {
    parse: (params) => ({
      postId: Number(params.postId),
    }),
    stringify: (params) => ({
      postId: String(params.postId),
    }),
  },
  loader: async ({ params }) => {
    // params.postId is now number
  },
})
```

## Type-Safe Navigation

```tsx
// TypeScript enforces correct params
<Link to="/posts/$postId" params={{ postId: '123' }}>
  View Post
</Link>

// Error: missing required param
<Link to="/posts/$postId">View Post</Link>
```

## Accessing Params in Components

```tsx
function PostComponent() {
  // From route definition
  const params = Route.useParams()

  // Or generic hook (less type-safe)
  const params = useParams({ from: '/posts/$postId' })
}
```

## API Reference

### useParams Hook

```tsx
function useParams<TFrom, TStrict, TSelected>(options: {
  from: TFrom // Route ID to get params from
  strict?: TStrict // Default: true, set false for loose types
  select?: (params) => TSelected // Transform the params object
  shouldThrow?: boolean // Default: true, throw if route not matched
  structuralSharing?: boolean // Enable structural sharing
}): TSelected | Params

// Examples
const params = useParams({ from: '/posts/$postId' }) // { postId: string }
const id = useParams({ from: '/posts/$postId', select: (p) => p.postId })
const loose = useParams({ strict: false }) // Partial params
```

### Route.useParams

Shorthand when inside a route component:

```tsx
function PostComponent() {
  const { postId } = Route.useParams() // Automatically typed
}
```

### params Option (Route)

```tsx
interface RouteOptions {
  params?: {
    parse: (raw: Record<string, string>) => ParsedParams
    stringify: (parsed: ParsedParams) => Record<string, string>
  }
}
```

### Path Parameter Syntax

| Pattern  | Example Path         | Params                     |
| -------- | -------------------- | -------------------------- |
| `$param` | `/posts/$id`         | `{ id: string }`           |
| `$a/$b`  | `/users/$u/posts/$p` | `{ u: string, p: string }` |
| `$`      | `/files/$`           | `{ _splat: string }`       |
