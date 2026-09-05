---
'@tanstack/react-router': patch
'@tanstack/router-core': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Preserve falsy thrown values in React and Vue error boundaries. Type boundary error components and `onCatch` callbacks as `unknown` across React, Solid, and Vue. Solid continues to wrap non-`Error` throws in an `Error` with the original value in `cause`.

When upgrading, narrow boundary errors (for example, with `error instanceof Error`) before reading `message` or `stack`. `ErrorComponentProps<TError>` remains available for values narrowed to a specific error type. Route `onError` types are unchanged.
