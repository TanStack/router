---
id: useBlockerHook
title: useBlocker hook
---

The `useBlocker` method is a hook that [blocks navigation](../../guide/navigation-blocking.md) when a condition is met.

## useBlocker options

The `useBlocker` hook accepts a single _required argument, an option object:

### `options.shouldBlockFn` option

- Required
- Type: `BlockerFn`
- This function should return a `boolean` or a `Promise<boolean>` that tells the blocker if it should block the current navigation
- The function has the argument of type `BlockerFnArgs` passed to it, which tells you information about the current and next route and the action performed
- Think of this function as telling the router if it should block the navigation, so returning `true` mean that it should block the navgation and `false` that it should be allowed

### `options.disabled` option

- Optional - defaults to `false`
- Type: `boolean`
- Specifies if the blocker should be entirely disabled or not

### `options.enableBeforeUnload` option

- Optional - defaults to `true`
- Type: `boolean | (() => boolean)`
- Tell the blocker to sometimes or always block the browser `beforeUnload` event or not

### `options.withResolver` option

- Optional - defaults to `false`
- Type: `boolean`
- Specify if your the resolver that the hook returns should be used or whether the information in your `shouldBlockFn` is enough the determine blocking

### `options.from` option

- Optional
- Type: `MatchLocation['to']`
- Specify from which route pattern the blocker should block navigations from

### `options.to` option

- Optional
- Type: `MatchLocation['to']`
- Specify from which route pattern the blocker should block navigations to

### `options.fromMatchOptions` option

- Optional
- Type: `Omit<MatchLocation, 'to'>`
- Give additional arguments to the routeMatching from

### `options.toMatchOptions` option

- Optional
- Type: `Omit<MatchLocation, 'to'>`
- Give additional arguments to the routeMatching to


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
    blockerFn: () => formIsDirty,
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
    shouldBlockFn: () => formIsDirty,
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

### Conditional blocking

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: ({ nextLocation }) => {
      if (nextLocation.pathname.includes('step/')) 
        return false
      
      return true
    }
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

### Skip resolver

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: ({ nextLocation }) => {
      if (nextLocation.pathname.includes('step/')) 
        return false
      
      const shouldLeave = confirm('Are you sure you want to leave?')
      return !shouldLeave
    }
  })

  // ...
}
```
