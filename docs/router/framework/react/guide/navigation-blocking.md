---
title: Navigation Blocking
---

Navigation blocking is a way to prevent navigation from happening. This is typical if a user attempts to navigate while they:

- Have unsaved changes
- Are in the middle of a form
- Are in the middle of a payment

In these situations, a prompt or custom UI should be shown to the user to confirm they want to navigate away.

- If the user confirms, navigation will continue as normal
- If the user cancels, all pending navigations will be blocked

## How does navigation blocking work?

Navigation blocking adds one or more layers of "blockers" to the entire underlying history API. If any blockers are present, navigation will be paused via one of the following ways:

- Custom UI
  - If the navigation is triggered by something we control at the router level, we can allow you to perform any task or show any UI you'd like to the user to confirm the action. Each blocker's `blocker` function will be asynchronously and sequentially executed. If any blocker function resolves or returns `true`, the navigation will be allowed and all other blockers will continue to do the same until all blockers have been allowed to proceed. If any single blocker resolves or returns `false`, the navigation will be canceled and the rest of the `blocker` functions will be ignored.
- The `onbeforeunload` event
  - For page events that we cannot control directly, we rely on the browser's `onbeforeunload` event. If the user attempts to close the tab or window, refresh, or "unload" the page assets in any way, the browser's generic "Are you sure you want to leave?" dialog will be shown. If the user confirms, all blockers will be bypassed and the page will unload. If the user cancels, the unload will be cancelled, and the page will remain as is.

## How do I use navigation blocking?

There are 2 ways to use navigation blocking:

- Hook/logical-based blocking
- Component-based blocking

## Hook/logical-based blocking

Let's imagine we want to prevent navigation if a form is dirty. We can do this by using the `useBlocker` hook:

[//]: # 'HookBasedBlockingExample'

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  useBlocker({
    shouldBlockFn: () => {
      if (!formIsDirty) return false

      const shouldLeave = confirm('Are you sure you want to leave?')
      return !shouldLeave
    },
  })

  // ...
}
```

[//]: # 'HookBasedBlockingExample'

`shouldBlockFn` gives you type safe access to the `current` and `next` location:

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  // always block going from /foo to /bar/123?hello=world
  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: ({ current, next }) => {
      return (
        current.routeId === '/foo' &&
        next.fullPath === '/bar/$id' &&
        next.params.id === 123 &&
        next.search.hello === 'world'
      )
    },
    withResolver: true,
  })

  // ...
}
```

Note that even if `shouldBlockFn` returns `false`, the browser's `beforeunload` event may still be triggered on page reloads or tab closing. To gain control over this, you can use the `enableBeforeUnload` option to conditionally register the `beforeunload` handler:

[//]: # 'HookBasedBlockingExample'

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  useBlocker({
    {/* ... */}
    enableBeforeUnload: formIsDirty, // or () => formIsDirty
  })

  // ...
}
```

You can find more information about the `useBlocker` hook in the [API reference](../api/router/useBlockerHook.md).

## Component-based blocking

In addition to logical/hook based blocking, you can use the `Block` component to achieve similar results:

[//]: # 'ComponentBasedBlockingExample'

```tsx
import { Block } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  return (
    <Block
      shouldBlockFn={() => {
        if (!formIsDirty) return false

        const shouldLeave = confirm('Are you sure you want to leave?')
        return !shouldLeave
      }}
      enableBeforeUnload={formIsDirty}
    />
  )

  // OR

  return (
    <Block
      shouldBlockFn={() => formIsDirty}
      enableBeforeUnload={formIsDirty}
      withResolver
    >
      {({ status, proceed, reset }) => <>{/* ... */}</>}
    </Block>
  )
}
```

[//]: # 'ComponentBasedBlockingExample'

## How can I show a custom UI?

In most cases, using `window.confirm` in the `shouldBlockFn` function with `withResolver: false` in the hook is enough since it will clearly show the user that the navigation is being blocked and resolve the blocking based on their response.

However, in some situations, you might want to show a custom UI that is intentionally less disruptive and more integrated with your app's design.

**Note:** The return value of `shouldBlockFn` does not resolve the blocking if `withResolver` is `true`.

### Hook/logical-based custom UI with resolver

[//]: # 'HookBasedCustomUIBlockingWithResolverExample'

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: () => formIsDirty,
    withResolver: true,
  })

  // ...

  return (
    <>
      {/* ... */}
      {status === 'blocked' && (
        <div>
          <p>Are you sure you want to leave?</p>
          <button onClick={proceed}>Yes</button>
          <button onClick={reset}>No</button>
        </div>
      )}
    </>
}
```

[//]: # 'HookBasedCustomUIBlockingWithResolverExample'

### Hook/logical-based custom UI without resolver

[//]: # 'HookBasedCustomUIBlockingWithoutResolverExample'

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  useBlocker({
    shouldBlockFn: () => {
      if (!formIsDirty) {
        return false
      }

      const shouldBlock = new Promise<boolean>((resolve) => {
        // Using a modal manager of your choice
        modals.open({
          title: 'Are you sure you want to leave?',
          children: (
            <SaveBlocker
              confirm={() => {
                modals.closeAll()
                resolve(false)
              }}
              reject={() => {
                modals.closeAll()
                resolve(true)
              }}
            />
          ),
          onClose: () => resolve(true),
        })
      })
      return shouldBlock
    },
  })

  // ...
}
```

[//]: # 'HookBasedCustomUIBlockingWithoutResolverExample'

### Component-based custom UI

Similarly to the hook, the `Block` component returns the same state and functions as render props:

[//]: # 'ComponentBasedCustomUIBlockingExample'

```tsx
import { Block } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  return (
    <Block shouldBlockFn={() => formIsDirty} withResolver>
      {({ status, proceed, reset }) => (
        <>
          {/* ... */}
          {status === 'blocked' && (
            <div>
              <p>Are you sure you want to leave?</p>
              <button onClick={proceed}>Yes</button>
              <button onClick={reset}>No</button>
            </div>
          )}
        </>
      )}
    </Block>
  )
}
```

[//]: # 'ComponentBasedCustomUIBlockingExample'
