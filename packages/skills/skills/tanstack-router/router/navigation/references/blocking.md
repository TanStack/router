# Navigation Blocking

Prevent navigation for unsaved changes or confirmation prompts.

## useBlocker Hook

```tsx
import { useBlocker } from '@tanstack/react-router'

function EditForm() {
  const [isDirty, setIsDirty] = useState(false)

  const { proceed, reset, status } = useBlocker({
    condition: isDirty,
  })

  return (
    <>
      <form onChange={() => setIsDirty(true)}>{/* form fields */}</form>

      {status === 'blocked' && (
        <dialog open>
          <p>You have unsaved changes. Leave anyway?</p>
          <button onClick={proceed}>Leave</button>
          <button onClick={reset}>Stay</button>
        </dialog>
      )}
    </>
  )
}
```

## Blocker Status

- `'idle'` - No blocked navigation
- `'blocked'` - Navigation blocked, awaiting decision
- `'proceeding'` - User chose to proceed

## Block with Message

```tsx
const { proceed, reset, status } = useBlocker({
  condition: isDirty,
  withResolver: true,
})
```

## beforeLoad Guards

Block navigation at route level:

```tsx
export const Route = createFileRoute('/checkout')({
  beforeLoad: async ({ context }) => {
    if (context.cart.isEmpty) {
      throw redirect({ to: '/shop' })
    }
  },
})
```

## Browser Unload Protection

Prevent accidental tab close:

```tsx
import { useEffect } from 'react'

function EditForm() {
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!isDirty) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])
}
```

## Conditional Blocking

```tsx
const { proceed, reset, status } = useBlocker({
  condition: isDirty && !isSubmitting,
})
```
