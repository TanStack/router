---
'@tanstack/react-router': minor
---

`renderRouterToStream` accepts an `onError` option. It is called for each error React reports while rendering, with the same arguments and return value as the `onError` option of React's streaming renderers, so a server can send render errors to its own logger or error tracker and return a `digest` for the client. Errors caused by an aborted request are still dropped. Without the option, errors are written with `console.error` as before.
