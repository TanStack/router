---
title: Navigation Blocking
---

Navigation blocking is a way to prevent navigation from happening. This is typical if a user attempts to navigate while they:

- Have unsaved changes
- Are in the middle of a form
- Are in the middle of a payment

In these situations, a prompt should be shown to the user to confirm they want to navigate away.

- If the user confirms, navigation will continue as normal
- If the user cancels, all pending navigations will be blocked

## How does navigation blocking work?

Navigation blocking adds one or more layers of "blockers" to the entire underlying history API. If any blockers are present, navigation will be blocked and the blockers will be called in the order they were added.

Depending on your framework adapter, you likely see 2 methods of navigation blocking:

- Hook/logical-based blocking
- Component-based blocking

## Hook/logical-based blocking

Each framework will have its own logical/hook based blocker API, but for this example, we'll use React. Let's imagine we want to prevent navigation if a form is dirty. We can do this by using the `useBlocker` hook:

```tsx
import { useBlocker } from '@tanstack/router-react'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  useBlocker('Are you sure you want to leave?', formIsDirty)

  // ...
}
```

The `useBlocker` hook takes 2 arguments:

- `message` - The message to show to the user when they attempt to navigate away
- `condition` - A boolean value that determines if navigation should be blocked

## Component-based blocking

In addition to logical/hook based blocking, each router adapter will export a component-based one as well. You can use the `Blocker` component to achieve similar results:

```tsx
import { Blocker } from '@tanstack/router-react'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  return (
    <Blocker message="Are you sure you want to leave?" when={formIsDirty}>
      {/* ... */}
    </Blocker>
  )
}
```
