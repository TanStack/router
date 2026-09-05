---
'@tanstack/react-router': patch
'@tanstack/router-core': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Preserve falsy thrown values in React and Vue error boundaries. Type React and Vue boundary error components and `onCatch` callbacks as `unknown`. Solid boundary errors remain typed as `Error`; SSR now wraps non-`Error` loader errors to match Solid’s native boundary behavior, preserving the original value in `cause`. Router state and loader `onError` values are unchanged.

When upgrading React or Vue, narrow boundary errors (for example, with `error instanceof Error`) before reading `message` or `stack`. `ErrorComponentProps<TError>` remains available for values narrowed to a specific error type. Route `onError` types are unchanged.
