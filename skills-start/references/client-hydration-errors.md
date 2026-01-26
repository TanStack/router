---
name: Hydration errors
description: Common causes and mitigation techniques.
version: 1
source: docs/start/framework/react/guide/hydration-errors.md
---

# Hydration errors

## Summary

- Mismatches are caused by non-deterministic server/client render output.
- Prefer deterministic inputs and server-provided locale/timezone.
- Use `<ClientOnly>` or selective SSR for unstable UI.

## Use cases

- Fix hydration mismatches in client-only widgets
- Stabilize output that depends on time or locale
- Apply selective SSR to problematic routes

## Notes

- Avoid `Date.now()` or random values in SSR output.
- Prefer deterministic locale/timezone input.

## Examples

```tsx
<ClientOnly fallback={<Spinner />}>
  <LiveChart />
</ClientOnly>
```
