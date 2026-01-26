# Type Utilities

Helper types for working with TanStack Router.

## Extract Route Types

```tsx
import type {
  RouteIds,
  RoutePaths,
  RouteById,
  RouteByPath,
} from '@tanstack/react-router'

// Get all route IDs
type AllRouteIds = RouteIds<typeof routeTree>
// '/posts' | '/posts/$postId' | ...

// Get all route paths
type AllPaths = RoutePaths<typeof routeTree>

// Get specific route type by ID
type PostRoute = RouteById<typeof routeTree, '/posts/$postId'>

// Get route by path
type PostRoute = RouteByPath<typeof routeTree, '/posts/$postId'>
```

## Extract Params Type

```tsx
import type { RouteParams } from '@tanstack/react-router'

type PostParams = RouteParams<'/posts/$postId'>
// { postId: string }

// From route
type PostParams = typeof postRoute extends { types: { params: infer P } }
  ? P
  : never
```

## Extract Search Type

```tsx
import type { SearchSchemaInput } from '@tanstack/react-router'

// Get search params type for a route
type PostSearch = SearchSchemaInput<typeof postRoute>
```

## Extract Loader Data Type

```tsx
// From route
type PostData = Awaited<ReturnType<typeof postRoute.options.loader>>

// Or use the route's built-in type
function Component() {
  const data = Route.useLoaderData()
  // data is typed based on loader return
}
```

## LinkProps Type

```tsx
import type { LinkProps } from '@tanstack/react-router'

// Type for link props to specific route
type PostLinkProps = LinkProps<
  typeof routeTree,
  '/posts/$postId',
  '/posts/$postId'
>
```

## Generic Route Components

```tsx
import type { AnyRoute } from '@tanstack/react-router'

function GenericLoader<TRoute extends AnyRoute>({ route }: { route: TRoute }) {
  // Works with any route
}
```

## useMatch Return Type

```tsx
import type { UseMatchReturnType } from '@tanstack/react-router'

type PostMatch = UseMatchReturnType<'/posts/$postId'>
```
