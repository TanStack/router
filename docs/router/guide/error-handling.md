---
id: error-handling
title: Error Handling
---

TanStack Router provides error handling at the route and router levels. Use `errorComponent` to display a fallback UI, `defaultErrorComponent` to configure a router-wide fallback, and `onError` to observe errors.

For missing routes or resources, see the [Not Found Errors guide](./not-found-errors.md).

## Route-level error components

Add `errorComponent` to a route when it needs a specific error UI. The component receives the error and a `reset` function. Since thrown values are not guaranteed to be `Error` instances, narrow the value before reading properties such as `message`.

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/reports')({
  loader: async () => {
    const response = await fetch('/api/reports')

    if (!response.ok) {
      throw new Error('Could not load reports')
    }

    return response.json()
  },
  errorComponent: ({ error, reset }) => {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'

    return (
      <div>
        <h2>Unable to load reports</h2>
        <p>{message}</p>
        <button onClick={reset}>Try again</button>
      </div>
    )
  },
})
```

A route-specific `errorComponent` takes precedence over the router's `defaultErrorComponent`. If a route does not define its own error component, the router can use the configured default.

The `reset` function clears the current error boundary state so the route can render again. It does not, by itself, guarantee that a failed loader will run again. For errors caused by route data loading, see [Recovering from loader errors](#recovering-from-loader-errors).

## Router-wide default error component

Set `defaultErrorComponent` when you want a shared fallback for routes that do not provide their own error component.

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

function DefaultErrorComponent({ error }: { error: unknown }) {
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred'

  return (
    <main>
      <h2>Something went wrong</h2>
      <p>{message}</p>
    </main>
  )
}

export const router = createRouter({
  routeTree,
  defaultErrorComponent: DefaultErrorComponent,
})
```

A route-specific `errorComponent` takes precedence over `defaultErrorComponent`. Configuring a default gives routes without a custom error UI a consistent fallback.

## Errors in `beforeLoad` and `loader`

Both `beforeLoad` and `loader` can throw errors, and TanStack Router handles these through its route error-handling flow.

- `beforeLoad` runs before the route's loader. If it throws, that route's loader does not run.
- `loader` runs to load route data. If it throws, the route's error-handling flow handles the failure.
- During navigation, an error can prevent the destination route from loading successfully. Preloading errors are handled differently from errors encountered during navigation.

Use `errorComponent` for the user-facing fallback. If you need to log or report an error, use `onError`. For more detail about route data loading and its lifecycle, see [Data Loading](./data-loading.md).

## Observing errors with `onError`

Use a route's `onError` callback to observe errors during route loading, for example, to send them to a logging service. The exact callback signature and examples are covered in the [Data Loading guide](./data-loading.md#handling-errors).

`onError` is for observing an error; it is not a replacement for an error component. Let the router's error-handling flow display the appropriate fallback UI.

## Recovering from loader errors

When a loader fails, resetting the error boundary alone may render the same failed state again because the route data has not been successfully reloaded. To retry a route load, call `router.invalidate()`. It coordinates reloading route data and resetting the error boundary.

For example, a retry button in an error component can invalidate the router:

```tsx
import { useRouter } from '@tanstack/react-router'

function ReportsErrorComponent({ error }: { error: unknown }) {
  const router = useRouter()

  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred'

  return (
    <div>
      <h2>Unable to load reports</h2>
      <p>{message}</p>
      <button
        onClick={() => {
          router.invalidate()
        }}
      >
        Retry
      </button>
    </div>
  )
}
```

Use `reset` when you only need to clear the current error boundary state and retry rendering. Use `router.invalidate()` when recovery requires route data to be loaded again. Choose the recovery behavior that matches the source of the error, and avoid retry loops for errors that will not resolve without user action.

For missing routes and resources, use the dedicated [Not Found Errors guide](./not-found-errors.md).
