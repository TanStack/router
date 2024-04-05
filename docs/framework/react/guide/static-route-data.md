---
title: Static Route Data
---

When creating routes, you can optionally specify a `staticData` property in the route's options. This object can literally contain anything you want as long as it's synchronously available when you create your route.

In addition to being able to access this data from the route itself, you can also access it from any match under the `match.staticData` property.

## Example

- `posts.tsx`

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  staticData: {
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
    const matches = useMatches()

    return (
      <div>
        {matches.map((match) => {
          return <div key={match.id}>{match.staticData.customData}</div>
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
  interface StaticDataRouteOption {
    customData: string
  }
}
```

Now, if you try to create a route without the `customData` property, you'll get a type error:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  staticData: {
    // Property 'customData' is missing in type '{ customData: number; }' but required in type 'StaticDataRouteOption'.ts(2741)
  },
})
```

## Optional Static Data

If you want to make static data optional, simply add a `?` to the property:

```tsx
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    customData?: string
  }
}
```

As long as there are any required properties on the `StaticDataRouteOption`, you'll be required to pass in an object.
