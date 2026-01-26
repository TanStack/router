# Router Devtools

Debug and inspect router state during development.

## Installation

```bash
npm install @tanstack/react-router-devtools
```

## Basic Setup

```tsx
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

// In root route component
function RootComponent() {
  return (
    <>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}
```

## Configuration

```tsx
<TanStackRouterDevtools
  position="bottom-right" // or 'bottom-left', 'top-right', 'top-left'
  initialIsOpen={false}
  panelProps={{
    style: { maxHeight: '50vh' },
  }}
/>
```

## Lazy Loading Devtools

Only load in development:

```tsx
import { lazy, Suspense } from 'react'

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-router-devtools').then((m) => ({
        default: m.TanStackRouterDevtools,
      })),
    )
  : () => null

function RootComponent() {
  return (
    <>
      <Outlet />
      <Suspense>
        <TanStackRouterDevtools />
      </Suspense>
    </>
  )
}
```

## Features

- **Route tree visualization**
- **Current matches and params**
- **Search param inspection**
- **Loader data viewing**
- **Navigation history**
- **Cache status**

## Production

Devtools are automatically excluded from production builds when using the lazy loading pattern above.

## Debugging Tips

1. Check "Matches" to see which routes matched
2. Inspect "Loader Data" for data issues
3. View "Search Params" for validation problems
4. Monitor "Pending" state for slow loaders
