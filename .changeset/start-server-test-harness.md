---
'@tanstack/start-server-core': minor
'@tanstack/start-client-core': minor
'@tanstack/start-plugin-core': minor
'@tanstack/start-storage-context': patch
'@tanstack/react-start': minor
'@tanstack/solid-start': minor
'@tanstack/vue-start': minor
---

Add `runInRequest`, `mockMiddleware` and `runMiddleware` for server tests, exported from `@tanstack/react-start/testing/server`, `@tanstack/solid-start/testing/server` and `@tanstack/vue-start/testing/server`. Experimental.

```ts
import {
  mockMiddleware,
  runInRequest,
  runMiddleware,
} from '@tanstack/react-start/testing/server'

test('likePost counts a like', async () => {
  await runInRequest({ headers: { cookie: 'session=ada' } }, async () => {
    expect(await likePost({ data: '1' })).toBe(1)
    expect(getResponseHeader('cache-control')).toBe('no-store')
  })
})
```

- `runInRequest` runs a callback as the code that handles one request. The request middleware of `src/start.ts` runs first. A server function call inside the callback runs as a loader's call does during server rendering: its middleware, its validator and its handler. Start's request and response helpers work inside the callback. `globalMiddleware: 'skip'` leaves the middleware of `src/start.ts` out and takes a `context` that is typed from the start instance.
- `mockMiddleware` replaces a middleware with a function that is typed from it. A mock ends with the test that registered it, or with the request when it was registered inside `runInRequest`.
- `runMiddleware` calls the server function of one middleware, for a function middleware and for a request middleware.

A server function that a test calls outside of `runInRequest` fails with an error that names `runInRequest`.

Fixes for test runs:

- A server test could not call a server function when Vitest served the calling module from its module cache, which is the default from the second run on. The call failed with "Invalid server function ID". In a test run the server now finds a function by its id alone.
- A project without a router entry could not load `@tanstack/react-start/server` in a server test (`Missing "#tanstack-router-entry" specifier`).
