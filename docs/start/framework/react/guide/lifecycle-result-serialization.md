---
id: lifecycle-result-serialization
title: Lifecycle Result Serialization
---

During the initial request, TanStack Start will run route lifecycle methods on the server and then hydrate on the client.

To speed up hydration, the server can include lifecycle return values in the dehydrated payload so the client does not need to re-run those lifecycles.

## Defaults

By default:

- `context` return values are not serialized
- `beforeLoad` return values are serialized
- `loader` return values are serialized

If a lifecycle return value is not serialized, the client will re-execute that lifecycle during hydration.

## When to serialize (and when not to)

Serialize when:

- You want faster hydration and fewer duplicate requests (client does not need to re-run the lifecycle)
- The value is serializable and safe to send to the browser

Avoid serialization when:

- The value is not serializable (e.g. functions, class instances)
- The value is large or would bloat the hydration payload
- The value contains secrets or server-only data you do not want to ship to the client

`context` is commonly not serialized because it often contains non-serializable values.

## Per-route overrides

Each lifecycle option can be defined in an object form to control serialization:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  // ...
  beforeLoad: {
    handler: () => ({ authCheckedAt: Date.now() }),
    serialize: true,
  },
  context: {
    handler: () => ({ browserOnly: typeof window !== 'undefined' }),
    serialize: false,
  },
  loader: {
    handler: async () => ({ postId: '123' }),
    serialize: true,
  },
})
```

## Router-level defaults

You can change the defaults using `defaultSerialize` in `createStart`:

```tsx
import { createStart } from '@tanstack/react-start'

export const startInstance = createStart(() => ({
  defaultSerialize: {
    // Example: serialize route context by default
    context: true,
  },
}))
```

## Type safety: serializability checks

TypeScript enforces serializability only when a lifecycle method is configured to be serialized (via the built-in defaults, your router `defaultSerialize`, and/or a per-route `serialize` flag).

For example, `beforeLoad` is serialized by default, so returning a function will produce a type error:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/bad')({
  beforeLoad: () => {
    return {
      // Type error: functions are not serializable
      onClick: () => {
        /* ... */
      },
    }
  },
})
```

If you disable serialization for that lifecycle, the serializability constraint is removed and the type error will not occur:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/ok')({
  beforeLoad: {
    serialize: false,
    handler: () => ({
      onClick: () => {
        /* ... */
      },
    }),
  },
})
```

With `serialize: false`, the client will re-run that lifecycle during hydration.
