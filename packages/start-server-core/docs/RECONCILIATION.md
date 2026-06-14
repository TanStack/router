# Response Reconciliation

This package owns request and response state for TanStack Start server runtime. `h3` is only used by session helpers and is created lazily when a session helper runs.

## Request State

Every Start request runs inside a shared `AsyncLocalStorage` event. The event contains:

- `request`: the original platform `Request`
- `response`: mutable Start response state
- `responseMeta`: metadata used to reconcile helper changes
- `h3Event`: optional lazy session-only `H3Event`

The ALS instance is stored on a global symbol so separately bundled copies of this module share one request context.

Native helpers read directly from this event:

- `getRequest`
- `getRequestHeaders`
- `getRequestHeader`
- `getRequestHost`
- `getRequestProtocol`
- `getRequestUrl`
- `getRequestIP`
- `getCookies`
- `getCookie`

These helpers do not construct or read from an `H3Event`.

## Response State

Start response helpers mutate event-owned state, not `h3` state:

- `setResponseStatus`
- `setResponseHeader`
- `setResponseHeaders`
- `removeResponseHeader`
- `clearResponseHeaders`
- `setCookie`
- `deleteCookie`

`getResponseHeader` and `getResponseHeaders` read the current returned response plus helper overlay. Helper writes are visible immediately, even before a final `Response` exists. Treat `getResponseHeaders()` as a read-only snapshot: mutating the returned `Headers` object does not mutate outgoing response state. Use `setResponseHeader`, `setResponseHeaders`, `removeResponseHeader`, or `clearResponseHeaders` for writes.

Internal code can use `getResponse` to access event-owned mutable response state during serialization. This is not public API; user code should use the status/header/cookie helpers above.

## Reconciliation Model

Route handlers, middleware, SSR handlers, and server functions can all return `Response` objects. Start reconciles those responses with helper mutations before the response leaves the request boundary.

Reconciliation rules:

- Helper state overlays returned `Response` state.
- Status and status text from `setResponseStatus` win over returned response status.
- Headers from response helpers win over returned response headers.
- `removeResponseHeader` and `clearResponseHeaders` can remove headers from a returned response.
- Helper deltas survive when a later middleware replaces the response.
- Direct mutations to an old `response.headers` object do not survive response replacement.
- Direct mutations to the current response are visible while that response remains current.
- If nothing changed, reconciliation returns the original `Response` instance.
- If only writable headers changed, reconciliation mutates the existing `Response` headers.
- If status/body shape changed or headers are readonly, reconciliation creates a new `Response` using the same body.

The implementation avoids cloning `Response` objects unless mutation is impossible or the response shape must change.

## Header Tracking

The event response headers are wrapped to track helper intent:

- `set` records a helper write.
- `append` records a helper write.
- `delete` records a helper removal.
- `clearResponseHeaders()` records a full clear.

This metadata matters because a plain `Headers` object cannot distinguish between "not set" and "explicitly removed".

## Cookies

Cookies use native `cookie-es` parsing and serialization.

`setCookie` appends `Set-Cookie` values and dedupes by cookie identity:

- name
- domain
- path

If domain is absent, identity uses an empty domain. `setCookie` defaults to `Path=/`, but returned `Set-Cookie` headers without `Path` keep an empty path identity so they do not dedupe against explicit-path cookies.

Cookie behavior has two modes:

- `setCookie`/`deleteCookie`: merge with existing returned response cookies.
- `setResponseHeader('set-cookie', ...)`: replace returned response cookies.

This preserves multiple `Set-Cookie` headers and lets explicit header APIs replace cookie state when requested.

## Protected Transport Headers

Server function protocol headers are protected after the protocol response is created:

- `content-type`
- `x-tss-serialized`
- `x-tss-raw`

Helper headers still reconcile onto server function responses, but protected transport headers win over user helper writes. This prevents user code from corrupting the client/server function protocol.

## Null Body Responses

Reconciliation drops bodies for response shapes that cannot carry one:

- `HEAD` requests
- status `204`
- status `205`
- status `304`

Informational statuses like `101` cannot be used to construct Fetch responses, so they are sanitized before reconciliation.

If a middleware sets one of these statuses after a streamed SSR response is produced, the middleware executor treats that as response replacement and disposes the original SSR stream owner.

## Stream Ownership

SSR streaming responses carry cleanup ownership metadata. Middleware reconciliation preserves or disposes that ownership based on the final body:

- Same response: ownership is preserved.
- Wrapper response with the same body: ownership moves to the wrapper.
- Different response or dropped body: original stream owner is disposed.
- Middleware error after `next()`: original stream owner is disposed.

This prevents cleanup leaks while still allowing middleware to wrap streamed responses without prematurely disposing the stream.

## Error Handling

`requestHandler` rethrows uncaught errors. Object/function errors are associated with the current Start event in a `WeakMap` so server entries can catch outside the ALS continuation and call `handleStartError(error)`.

Generated server entries wrap `entry.fetch(...args)` in `try/catch` and call `handleStartError(error)`. Custom server entries that call `createStartHandler(...)` directly should do the same if they want Start's default conversion.

Server function RPC errors are converted before the top-level server-entry boundary so serialized protocol headers and bodies are preserved.

`handleStartError` behavior:

- If ALS is still active, it uses the current event.
- If the error was remembered, it uses and deletes the remembered event.
- If the error is a `Response`, it returns that response when no Start event exists.
- Otherwise it returns a generic JSON error response.

Primitive throws are rethrown as-is. Without an associated Start event, `handleStartError(error)` can still return a generic error response, but it cannot recover request-specific state.

## h3 Session Bridge

Session helpers lazily create an `H3Event` only when needed:

- `useSession`
- `getSession`
- `updateSession`
- `sealSession`
- `unsealSession`
- `clearSession`

Before a session helper runs, Start response state is copied to `h3Event.res`. After the helper returns, `h3Event.res.headers` is merged back into Start response state. `Set-Cookie` values from session helpers merge through the same cookie dedupe path as native `setCookie`.

No request helper or non-session response helper depends on `h3`.

## Malformed URLs

`requestHandler` validates `request.url` before entering ALS. A malformed URL that throws `URIError` or `TypeError` becomes `400 Bad Request`. Other URL construction errors are rethrown.
