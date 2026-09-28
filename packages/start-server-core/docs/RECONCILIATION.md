# Response Reconciliation

This package owns request and response state for the TanStack Start server runtime. Applications choose their session library and connect it to Start's request and response cookie helpers.

## Request State

Every Start request runs inside a shared `AsyncLocalStorage` event. The event contains:

- `request`: the original platform `Request`
- `requestUrl`: the parsed request URL, memoized so the framework parses each request URL only once
- `responseState`: lazily created mutable Start response state (`undefined` until the first helper write)
- `currentResponse`: the most recently reconciled response
- `responseHeaderAppends`: lazily created request-owned records of already-applied header appends

The ALS instance is stored on a global symbol so separately bundled copies of this module share one request context. Helper state and append records belong to that invocation. Protocol protection describes the response body: its immutable snapshot is attached to Start-created responses through a non-enumerable global symbol. This protection follows the response through delegated requests, including cloned requests and separately bundled runtime copies.

`createServerEntry` owns the scope around the complete entry callback, including custom error handling. Delegating through another wrapped entry or Start handler with the same `Request` object reuses that scope. A different `Request` object gets its own scope.

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

These helpers do not construct or read from an h3 event.

## Response State

Start response helpers mutate event-owned state, not `h3` state:

- `setResponseStatus`
- `setResponseHeader`
- `setResponseHeaders`
- `appendResponseHeader`
- `removeResponseHeader`
- `clearResponseHeaders`
- `setCookie`
- `deleteCookie`

Response state is created lazily on the first helper write. Requests that never call a response helper skip response-state allocation. Reconciliation still enforces bodyless response rules, and Start restores protocol headers when a server-function reply leaves the request middleware pipeline.

`getResponseHeader` and `getResponseHeaders` read the current returned response plus helper overlay. Helper writes are visible immediately, even before a final `Response` exists. `getResponseHeaders()` returns a detached snapshot with a read-only TypeScript interface. Its `forEach` callback also receives that read-only interface. Casting the snapshot to `Headers` and mutating it does not change outgoing response state; outside production, `set`, `append`, and `delete` on the snapshot log a warning that lists the helpers to use instead. Use `setResponseHeader`, `setResponseHeaders`, `appendResponseHeader`, `removeResponseHeader`, or `clearResponseHeaders` for writes. Use `getSetCookie()` on the snapshot when all individual cookie values are needed.

Internal code can use `getSerializedResponseState` to read the helper status and status text that apply to a serialized server-function reply. This is not public API and it is read-only; all writes go through the status/header/cookie helpers above.

## Reconciliation Model

Route handlers, middleware, SSR handlers, and server functions can all return `Response` objects. Start reconciles those responses with helper mutations before they cross each user middleware boundary. The request-scope wrapper only establishes or reuses the scope; it does not repeat reconciliation after the pipeline completes. Responses created outside the pipeline, including resolved redirects and server-function errors, are finalized at those creation points.

When middleware replaces a body, or response status rules drop it, Start disposes the body before reading the helper state and recording applied appends. Synchronous cancellation and SSR cleanup callbacks can therefore contribute headers to the outgoing response. Eager router cleanup also finishes before final response publication.

Reconciliation rules:

- Helper state overlays returned `Response` state.
- Status and status text from `setResponseStatus` win over returned response status.
- Header replacement helpers win over returned response headers; append helpers retain the existing values.
- `removeResponseHeader` and `clearResponseHeaders` can remove headers from a returned response.
- Helper deltas survive when a later middleware replaces the response.
- Direct mutations to an old `response.headers` object do not survive response replacement.
- Direct mutations to the current response are visible while that response remains current.
- Reconciliation returns the original `Response` instance when its effective headers, status, status text, and body shape are unchanged. It still records which helper appends have been applied.
- If headers, status, or body shape change, reconciliation creates a new `Response` with copied headers and the same body stream, unless the body must be dropped.

Reconciliation does not mutate a response supplied by application code, including a response reused across requests. It does not call `Response.clone()` or tee the body. The replacement becomes the body owner; application code must not also consume the original response's body.

Router redirect responses keep their navigation options until Start resolves their destination and, for server-function RPC calls, creates the JSON redirect envelope. Generic response materialization runs after this step. While a redirect is pending, response getter helpers see the helper overlay, but direct reads of `result.response.headers` or `result.response.status` still see the unresolved redirect's own values.

## Header Tracking

Helper intent is recorded directly by the helper write functions:

- `setResponseHeader`/`setResponseHeaders` record a helper write.
- `appendResponseHeader` records a helper write without replacing values.
- `removeResponseHeader` records a helper removal.
- `clearResponseHeaders()` records a full clear.

This metadata matters because a plain `Headers` object cannot distinguish between "not set" and "explicitly removed". All response-state mutations flow through these module-level functions; the state object never escapes for direct mutation.

For example, appending `Origin` to a response containing `Vary: Accept-Encoding` produces `Vary: Accept-Encoding, Origin`. Repeated reconciliation of that response does not repeat the append. A later append is applied once, and helper appends also apply when middleware replaces the response with a fresh response.

An application-created response is a new explicit base. If middleware copies headers that already contain an applied helper append into a new response, that copied value is part of the new base and the helper append can appear again. Reuse the current response when it already contains the desired headers; returning a new response does not transfer Start's private append metadata.

## Cookies

Cookies use native `cookie-es` parsing and serialization.

`setCookie` appends `Set-Cookie` values and dedupes by cookie identity:

- name
- domain
- path

If domain is absent, identity uses an empty domain. `setCookie` defaults to `Path=/`, but returned `Set-Cookie` headers without `Path` keep an empty path identity so they do not dedupe against explicit-path cookies.

A `Set-Cookie` value that `cookie-es` cannot parse, for example one whose name is an `Object.prototype` key such as `constructor` or whose name and value exceed 4096 characters, is identified by its exact string. Only identical strings dedupe.

Cookie behavior has two modes:

- `setCookie`/`deleteCookie`/`appendResponseHeader('set-cookie', ...)`: merge with existing returned response cookies.
- `setResponseHeader('set-cookie', ...)`: replace returned response cookies.

This preserves multiple `Set-Cookie` headers and lets explicit header APIs replace cookie state when requested.

`appendResponseHeader('set-cookie', ...)` takes fully serialized cookie strings and merges them through the same identity dedupe as `setCookie`. It is the generic primitive for bridging external session/auth libraries that produce raw `Set-Cookie` strings.

## Protected Transport Headers

Server function protocol responses protect required header values and required absence:

- Serialized JSON and framed results require their content type and `x-tss-serialized: true`, with `x-tss-raw` absent.
- Plain redirect and not-found JSON require JSON content type, with both incompatible transport markers absent.
- Explicit raw responses require `x-tss-raw: true`; their application content type is not protected.
- A non-redirect `Response` that a server function or its function middleware throws requires `x-tss-raw: thrown`, and the client rejects the call with it. Its application content type is not protected either. `fetch` follows a raw or thrown `Response` with a redirect status and `Location` before the client sees it, so navigation uses `redirect()`.

Every serialized reply (JSON and framed results, errors, not-found envelopes, and RPC redirect envelopes) also requires `Location` to be absent, whether it comes from a helper, from error metadata, or from `notFound({ headers })`. The client decodes these replies from their body. Error replies always use an error status, but a helper can still select a 3xx status for other serialized replies, and an HTTP `Location` would then make fetch follow the redirect before the client decodes the reply. For redirect envelopes, the client reads the destination from the JSON `href`. Native form and document redirects still use `Location`. Helper status and status text control HTTP metadata, while the redirect's own `statusCode` remains in its Router navigation options.

Other helper headers and cookies still reconcile onto server function responses. Replacing, removing, or clearing headers through the helpers cannot change protected protocol requirements.

Middleware can also change protocol headers directly on `result.response`, including from a callback attached to the `next()` promise it returns. Start restores the protocol headers once, when the reply leaves the request middleware pipeline, so the client always receives them. Until then, outer middleware reading `result.response.headers` sees such a direct change, while `getResponseHeader` and `getResponseHeaders` always report the protocol values. Without request middleware, only Start has handled the reply, so nothing is checked. Start does not check at every middleware boundary because `Headers.get` validates each header name on every call, which made the check a measurable share of each server-function request.

## Null Body Responses

Reconciliation drops bodies for response shapes that cannot carry one:

- `HEAD` requests
- status `204`
- status `205`
- status `304`

`setResponseStatus` ignores codes that are not integers from `200` to `599`, such as informational `101`, `0`, or `NaN`, because Fetch responses cannot carry them. The call changes neither status nor status text: an earlier helper status, or otherwise the returned or error status, stays in effect, and Start logs a warning outside production. Call `setResponseStatus(undefined, text)` to set only the status text.

Server-function replies that Start serializes are the exception. Their protected content type describes a body that the client must decode, so reconciliation never applies a helper-selected `204`, `205`, or `304` to them, together with that call's status text. Serialized errors ignore these statuses from error metadata too. Outside production, Start logs a warning, once per request, when it ignores such a status for a serialized reply. Serialized replies are recognized by the protocol requirements Start attaches to the `Response` it creates. Middleware that clones a serialized reply or rebuilds it around a new body must pass the result through `transferResponseBodyOwnership` to keep those requirements; otherwise the rebuilt response is an ordinary response, so a bodyless helper status drops its body and its `Location` is not removed. A raw `Response` returned by a server function is not serialized and still follows the rules above.

If a middleware sets one of these statuses after a streamed SSR response is produced, the middleware executor treats that as response replacement and disposes the original SSR stream owner.

## Stream Ownership

SSR streaming responses carry cleanup ownership metadata. Middleware reconciliation preserves or disposes that ownership based on the final body:

- Same response: ownership is preserved.
- Wrapper response with the same body: ownership moves to the wrapper, and the wrapper keeps the protected transport headers of the body it wraps. Start recognizes such a wrapper by the identity of its body stream. Some runtimes, such as Bun, can give a wrapper a new stream object for the same bytes, so middleware that wraps a server-function reply portably should use `transferResponseBodyOwnership(source, wrapper)`. A wrapper around a reply without a body has no stream to compare and is an ordinary replacement response without protocol protection.
- Different response or dropped body: original stream owner is disposed.
- Middleware error after `next()`: original stream owner is disposed.
- Late result from an abandoned `next()`: a middleware can return its own response while its `next()` is still running, for example a timeout built with `Promise.race`. From then on, the result of that `next()` is abandoned, even while outer middleware is still running. It never replaces or cancels the response the middleware returned, and its body is disposed. Helper writes made by the abandoned work still apply, because helper state belongs to the request.

This prevents cleanup leaks while still allowing middleware to wrap streamed responses without prematurely disposing the stream.

`transferResponseBodyOwnership(source, wrapper)` also preserves the transport headers required to decode the source body. It does not copy helper append records: an application wrapper's headers remain a fresh base for helper writes.

## Error Handling

`createStartHandler` rethrows the original uncaught value, including primitive values. No error object is used as a key for recovering request state. Concurrent requests can throw the same error or reusable bodyless response without sharing helper state. A response body stream still has a single consumer.

Built-in server entries use `createServerEntry` to keep the complete entry callback inside its request scope. The wrapper catches an uncaught value in that scope and calls `handleStartError`. A custom catch inside the wrapper can log and rethrow the error, return a custom response, or call `handleStartError(error)` to preserve Start's helper state.

Server function RPC errors are converted before the top-level server-entry boundary so serialized protocol headers and bodies are preserved. Their body is the same `{ error }` envelope that a failed server-function call sends, so the client rethrows whatever value was thrown, including strings, plain objects, and `undefined`. A value that cannot be serialized is replaced by the serialization error, as for a result that cannot be serialized. A `Response` that request middleware throws during a server-function request is sent with `x-tss-raw: thrown`, and the client rejects the call with it. Throwing the reply that `next()` returned, or a wrapper around its body, re-sends that reply unchanged, because the body keeps the protocol that decodes it.

Errors thrown inside a server-function handler or its function middleware do not reach these builders: the function returns them in its serialized result, which uses the helper status or `200` like any other result. A thrown non-redirect `Response` is sent raw instead, with its own status unless a helper selected one. Both error builders resolve status the same way. An error response only uses an error status (`400`-`599`). A status set with `setResponseStatus` before the error applies only when it is an error status. A success, redirect, or bodyless status such as `200`, `201`, `302`, or `204` describes the response that the failure replaced, so Start discards it together with its status text and uses the error's own status or `500`. Error metadata such as `error.status` or `error.statusCode` likewise applies only when it is `400` or higher. Start logs the error to the server console unless the error's own metadata marks it as an HTTP error with a status of `400` or higher, even when a helper selected the status. Because a discarded helper status no longer applies, later reconciliation and `getResponseStatus()` report the error status.

Both error builders adopt HTTP-style metadata from the thrown value, or from `error.cause` when the error has no `headers`. Start builds a new JSON body for an error, so it never copies the framing and connection headers `Content-Length`, `Content-Encoding`, `Transfer-Encoding`, `Trailer`, `Connection`, `Keep-Alive`, `Proxy-Connection`, and `TE` from error metadata. When `error.cause` is a `Response`, such as a failed upstream `fetch` from any fetch implementation, Start uses its status and status text but none of its headers, because they were written for that upstream reply.

`handleStartError` behavior:

- Inside an active request scope, it uses that invocation's event for object, response, and primitive throws.
- If the error is a `Response`, it returns that response when no Start event exists.
- Otherwise it returns a generic JSON error response.

Calling `handleStartError` after a raw handler has escaped its request scope cannot recover that request's state. Wrap the complete entry callback with `createServerEntry` instead. When rewriting or cloning a request, invoke a wrapped entry for that new `Request`, so errors are converted within its child scope. Calling a raw handler with the new request and catching only in the original request's scope cannot recover the child's helper writes.

A response returned by a custom entry catch is used as-is. It does not automatically inherit helper state; call `handleStartError` when that inheritance is intended. Delegation through wrapped entries with the same request shares helper state, but each wrapped entry still converts uncaught errors. Invoke a raw `createStartHandler` function when an outer custom catch needs the original thrown value.

## External sessions

Start has no built-in session API, session cache, encryption engine, or direct h3 dependency. Session policy and persistence belong to the application's chosen library.

Three integration boundaries are supported:

- Libraries that read `Cookie` and emit serialized `Set-Cookie`: use `getRequestHeader('cookie')` and `appendResponseHeader('set-cookie', serializedCookie)`.
- Libraries with a cookie adapter, such as iron-session 9: supply `{ read: getCookie, write: setCookie }`. Load inside the request, then await `session.save()` before returning or redirecting.
- Libraries with a Fetch handler: return the library's `fetch(request)` response from a Start server route. Its response cookies participate in normal reconciliation.

Use `appendResponseHeader` once for each serialized cookie. Preserve separate `Set-Cookie` values with `headers.getSetCookie()` when adapting a headers collection; commas in `Expires` are not cookie separators. `setResponseHeader('set-cookie', ...)` intentionally replaces the cookie collection and is inappropriate for adding an independent session cookie.

Start does not auto-save session mutations, consume flash values, renew tokens, share multiple independently loaded session objects, or revoke server-side records. Read a session once per request and share that object through request middleware context when needed. Commit changes explicitly before a response is sent. Parallel requests still need the selected store's concurrency policy; request context does not serialize them.

Removing the old APIs does not migrate existing sealed h3 cookies. Choose a fresh cookie name and require sign-in again, or implement and test an application-specific transition with the old library before removing it. See the authentication guide and the external-session fixture for concrete integrations.

## Malformed URLs

The request boundary validates `request.url` before creating its scope. A URL construction `TypeError` becomes `400 Bad Request`. Other errors are rethrown.
