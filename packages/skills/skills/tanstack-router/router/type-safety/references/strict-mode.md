# Strict Typing

Best practices for maximum type safety.

## Route Definition

Always define explicit types:

```tsx
interface PostLoaderData {
  post: Post
  comments: Comment[]
}

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }): Promise<PostLoaderData> => {
    return {
      post: await fetchPost(params.postId),
      comments: await fetchComments(params.postId),
    }
  },
})
```

## Search Param Schemas

Use strict schema validation:

```tsx
import { z } from 'zod'

// Strict schema - no extra properties allowed
const searchSchema = z
  .object({
    page: z.number().int().positive(),
    filter: z.enum(['all', 'active', 'completed']),
  })
  .strict()

export const Route = createFileRoute('/posts')({
  validateSearch: searchSchema,
})
```

## Avoid Type Assertions

```tsx
// ❌ Bad - bypasses type checking
const params = Route.useParams() as { postId: number }

// ✅ Good - use param parsing
export const Route = createFileRoute('/posts/$postId')({
  params: {
    parse: (p) => ({ postId: Number(p.postId) }),
    stringify: (p) => ({ postId: String(p.postId) }),
  },
})
```

## Type-Safe Context

```tsx
interface AppContext {
  auth: AuthContext
  queryClient: QueryClient
}

// Strictly type context
const router = createRouter({
  routeTree,
  context: {} as AppContext,
})
```

## Narrowing Route Matches

```tsx
function Component() {
  const match = useMatch({
    from: '/posts/$postId',
    shouldThrow: false,
  })

  if (!match) return null

  // match is now narrowed to the specific route
  const { postId } = match.params // typed as string
}
```

## Strict Link Typing

```tsx
// Enable strict route checking
<Link
  to="/posts/$postId"
  params={{ postId: '123' }} // Required
  search={{}} // Must match route schema
>
  Post
</Link>
```

## noUncheckedIndexedAccess

Enable in tsconfig.json for safer array/object access:

```json
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true
  }
}
```

```tsx
const posts = Route.useLoaderData().posts
const first = posts[0] // Type: Post | undefined
```
