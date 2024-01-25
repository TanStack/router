---
title: Static Route Data
---

When creating routes, you can optionally specify a `static` property in the route's options. This static property can literally be anything you want it to be as long as it's synchronous available when you create your route.

- `posts.tsx`

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  static: {
    customData: 'Hello!',
  },
})
```

You can then access this data anywhere you have access to your routes, including matches that can be mapped back to their routes.

- `__root.tsx`

```tsx
import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => {
    const router = useRouter()
    const matches = useMatches()

    return (
      <div>
        {matches.map((match) => {
          // Get the route for the match
          const route = router.looseRoutesById[match.routeId]
          return <div key={match.routeId}>{route.static.customData}</div>
        })}
      </div>
    )
  },
})
```

## Enforcing Static Data

If you want to enforce that a route has static data, you can use declaration merging to add a type to the route's static option:

```tsx
declare module '@tanstack/react-router' {
  interface StaticRouteOption {
    customData: string
  }
}
```

Now, if you try to create a route without the `customData` property, you'll get a type error:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  static: {
    // Property 'customData' is missing in type '{ customData: number; }' but required in type 'StaticRouteOption'.ts(2741)
  },
})
```

## Optional Static Data

If you want to make static data optional, simply add a `?` to the property:

```tsx
declare module '@tanstack/react-router' {
  interface StaticRouteOption {
    customData?: string
  }
}
```

As long as there are any required properties on the `StaticRouteOption`, you'll be required to pass in an object.
