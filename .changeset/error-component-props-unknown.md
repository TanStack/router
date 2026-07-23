---
'@tanstack/router-core': minor
'@tanstack/react-router': minor
'@tanstack/solid-router': minor
'@tanstack/vue-router': minor
---

Type the `error` prop passed to error components as `unknown` instead of `Error`.

Route loading and rendering code can throw any value — a primitive, a rich
domain object, or an `Error` — and the router already modelled `RouteMatch.error`
as `unknown`. Only the error-component contract claimed `Error`, which forced an
`as any` cast internally and misled consumers into unguarded `error.message`
access that could fail at runtime.

`ErrorComponentProps` no longer takes a `TError` type parameter. The parameter
was introduced in a previous release but never propagated through route
configuration or the React, Solid, and Vue `ErrorRouteComponent` contracts, so
it could not describe the thrown value. A typed-error API can be revisited if an
explicit error type can be threaded end to end.

Error components must now narrow before accessing error-specific properties:

```tsx
errorComponent: ({ error }) => {
  const message = error instanceof Error ? error.message : String(error)

  return <div>{message}</div>
}
```
