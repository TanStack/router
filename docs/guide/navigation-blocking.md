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
  - For page events that we cannot control directly, we rely on the browser's `onbeforeunload` event. If the user attempts to close the tab or window, refresh, or "unload" the page assets in any way, the browser's generic "Are you sure you want to leave?" dialog will be shown. If the user confirms, all blockers will be bypassed and the page will unload. If the user cancels, the unload will be cancelled, and the page will remain as is. It's important to note that **custom blocker functions will not be executed** when the `onbeforeunload` flow is triggered.

## What about the back button?

The back button is a special case. When the user clicks the back button, we cannot intercept or control the browser's behavior in a reliable way, and there is no official way to block it that works across all browsers equally. If you encounter a situation where you need to block the back button, it's recommended to rethink your UI/UX to avoid the back button being destructive to any unsaved user data. Saving data to session storage and restoring it if the user returns to the page is a safe and reliable pattern.

## How do I use navigation blocking?

There are 2 ways to use navigation blocking:

- Hook/logical-based blocking
- Component-based blocking

## Hook/logical-based blocking

Let's imagine we want to prevent navigation if a form is dirty. We can do this by using the `useBlocker` hook:

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  useBlocker(
    () => window.confirm('Are you sure you want to leave?'),
    formIsDirty,
  )

  // ...
}
```

The `useBlocker` hook takes 2 arguments:

- `message: () => string` **Required** - A function that returns a string to show to the user when they attempt to navigate away
- `condition?: boolean` Optional, defaults to `true` - Any expression or variable to be tested for truthiness to determine if navigation should be blocked

## Component-based blocking

In addition to logical/hook based blocking, can use the `Blocker` component to achieve similar results:

```tsx
import { Blocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  return (
    <Blocker
      blocker={() => window.confirm('Are you sure you want to leave?')}
      when={formIsDirty}
    />
  )

  // OR

  return (
    <Blocker
      blocker={() => window.confirm('Are you sure you want to leave?')}
      when={formIsDirty}
    >
      {/* ... */}
    </Blocker>
  )
}
```
