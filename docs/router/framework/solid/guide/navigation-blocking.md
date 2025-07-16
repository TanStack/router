---
ref: docs/router/framework/react/guide/navigation-blocking.md
replace: { 'react-router': 'solid-router' }
---

[//]: # 'HookBasedBlockingExample'

```tsx
import { useBlocker } from '@tanstack/solid-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = createSignal(false)

  useBlocker({
    shouldBlockFn: () => {
      if (!formIsDirty()) return false

      const shouldLeave = confirm('Are you sure you want to leave?')
      return !shouldLeave
    },
  })

  // ...
}
```

[//]: # 'HookBasedBlockingExample'
[//]: # 'ComponentBasedBlockingExample'

```tsx
import { Block } from '@tanstack/solid-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = createSignal(false)

  return (
    <Block
      shouldBlockFn={() => {
        if (!formIsDirty()) return false

        const shouldLeave = confirm('Are you sure you want to leave?')
        return !shouldLeave
      }}
    />
  )

  // OR

  return (
    <Block shouldBlockFn={() => !formIsDirty} withResolver>
      {({ status, proceed, reset }) => <>{/* ... */}</>}
    </Block>
  )
}
```

[//]: # 'ComponentBasedBlockingExample'
[//]: # 'HookBasedCustomUIBlockingWithResolverExample'

```tsx
import { useBlocker } from '@tanstack/solid-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = createSignal(false)

  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: () => formIsDirty(),
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
[//]: # 'HookBasedCustomUIBlockingWithoutResolverExample'

```tsx
import { useBlocker } from '@tanstack/solid-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = createSignal(false)

  useBlocker({
    shouldBlockFn: () => {
      if (!formIsDirty()) {
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
[//]: # 'ComponentBasedCustomUIBlockingExample'

```tsx
import { Block } from '@tanstack/solid-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = createSignal(false)

  return (
    <Block shouldBlockFn={() => formIsDirty()} withResolver>
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
