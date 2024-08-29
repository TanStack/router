---
id: useBlockerHook
title: useBlocker hook
---

The `useBlocker` method is a hook that [blocks navigation](../../guide/navigation-blocking.md) when a condition is met.

## useBlocker options

The `useBlocker` hook accepts a single _optional_ argument, an option object:

### `options.blockerFn` option

- Optional
- Type: `BlockerFn`
- The function that returns a `boolean` or `Promise<boolean>` indicating whether to allow navigation.

### `options.condition` option

- Optional - defaults to `true`
- Type: `boolean`
- A navigation attempt is blocked when this condition is `true`.

## useBlocker returns

An object with the controls to allow manual blocking and unblocking of navigation.

- `status` - A string literal that can be either `'blocked'` or `'idle'`
- `proceed` - A function that allows navigation to continue
- `reset` - A function that cancels navigation (`status` will be be reset to `'idle'`)

## Examples

Two common use cases for the `useBlocker` hook are:

### Basic usage

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  useBlocker({
    blockerFn: () => window.confirm('Are you sure you want to leave?'),
    condition: formIsDirty,
  })

  // ...
}
```

### Custom UI

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  const { proceed, reset, status } = useBlocker({
    condition: formIsDirty,
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
