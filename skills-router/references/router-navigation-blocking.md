---
name: Navigation blocking
description: Block navigation for unsaved changes or confirmation.
version: 1
source: docs/router/framework/react/guide/navigation-blocking.md
---

# Navigation blocking

## Summary

- Use `useBlocker` or `<Block>` to prevent navigation.
- `shouldBlockFn` can be sync or async.
- `enableBeforeUnload` controls native unload prompt.

## Use cases

- Warn users about unsaved changes
- Prevent navigation during critical workflows
- Confirm leaving a multi-step form

## Notes

- Async blockers can decide after checks or prompts.
- `enableBeforeUnload` uses the browser's generic message.

## Examples

```tsx
const blocker = useBlocker({
  shouldBlockFn: () => form.isDirty,
})

if (blocker.state === 'blocked') {
  return (
    <Confirm
      onConfirm={() => blocker.proceed()}
      onCancel={() => blocker.reset()}
    />
  )
}
```
