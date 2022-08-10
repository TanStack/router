---
id: prompts
title: Prompts
---

Prompts are available, but not built-in to TanStack Location. To build and use your own prompt logic, you can use the `useLocationManager` to access the underlying `history` instance and use its `block` method to block navigation under specific conditions.

Here is an example of creating a React Hook that blocks `window` navigation when enabled with a boolean:

```tsx
export function usePrompt(message: string, enabled: any): void {
  // Get the lo
  const locationManager = useLocationManager()

  React.useEffect(() => {
    if (!enabled) return

    let unblock = locationManager.history.block((transition) => {
      if (window.confirm(message)) {
        unblock()
        transition.retry()
      } else {
        locationManager.current.pathname = window.location.pathname
      }
    })

    return unblock
  }, [enabled, locationManager, message])
}
```

Similary, a `Prompt` component could be created by consuming a `usePrompt`-like utility:

```tsx
export function Prompt({
  message,
  when,
  children,
}: {
  message: string
  when?: any
  children?: React.ReactNode
}) {
  usePrompt(
    message,
    when ?? true, // By default, block when rendered
  )

  return (children ?? null) as React.ReactNode
}
```
