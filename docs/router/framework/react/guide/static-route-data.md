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

## Common Patterns

### Controlling Layout Visibility

Use staticData to control which routes show or hide layout elements:

```tsx
// routes/admin/route.tsx
export const Route = createFileRoute('/admin')({
  staticData: { showNavbar: false },
  component: AdminLayout,
})
```

```tsx
// routes/__root.tsx
function RootComponent() {
  const showNavbar = useMatches({
    select: (matches) =>
      !matches.some((m) => m.staticData?.showNavbar === false),
  })

  return showNavbar ? (
    <Navbar>
      <Outlet />
    </Navbar>
  ) : (
    <Outlet />
  )
}
```

### Route Titles for Breadcrumbs

```tsx
// routes/posts/$postId.tsx
export const Route = createFileRoute('/posts/$postId')({
  staticData: {
    getTitle: () => 'Post Details',
  },
})
```

```tsx
// In a Breadcrumb component
function Breadcrumbs() {
  const matches = useMatches()

  return (
    <nav>
      {matches
        .filter((m) => m.staticData?.getTitle)
        .map((m) => (
          <span key={m.id}>{m.staticData.getTitle()}</span>
        ))}
    </nav>
  )
}
```

### When to Use staticData vs Context

| staticData                             | context                         |
| -------------------------------------- | ------------------------------- |
| Synchronous, defined at route creation | Can be async (via `beforeLoad`) |
| Available before loading starts        | Can depend on params/search     |
| Same for all instances of a route      | Passed down to child routes     |

Use staticData for static route metadata. Use context for dynamic data or auth state that varies per request.
