# Start server response ownership

This document describes how Start tracks response bodies while server middleware runs.

## Two ownership layers

Response body ownership tells Start which body belongs to the current middleware result.

Router SSR ownership tells Router when it can release request data, serialization state, readers, timers, and renderer work.

An internal `SsrResponse` value carries Router SSR cleanup data beside a `Response`. Start stores that data while middleware sees the ordinary `Response`.

Each request must use a separate router instance. Sharing one router between requests is unsupported.

## Middleware transfers

Start keeps one ownership record for the current response body. A response without a body does not need an ownership record.

Ownership moves to the response that middleware returns in these cases:

- Middleware returns the same `Response` object.
- Middleware returns another `Response` with the same body object.
- Middleware returns another `Response` with a body while the current body is locked.

Web Streams do not expose the source of a different body. A lock is the only public sign that code reads the current body. A pipe or `tee()` locks it, and so does a `Response` constructor that copies a body by reading it, as in Bun or with a wrapped global `Response`.

A lock does not prove stream ancestry: a reader can also stop early. Start cannot tell that reader from a pipe, so it never disposes a locked body when middleware replaces it. Such a stream ends with the request's abort or the SSR stream's lifetime limit.

Only the same body object keeps the transport headers that Start protects for serialized server-function replies. A different body can carry different bytes.

When Start rebuilds the current response to apply response helpers or restore protocol headers, the rebuilt response takes over the ownership record directly. Start does not compare bodies for its own rebuilds.

## Replacement and disposal

A response with an unrelated body replaces the current ownership record when nothing reads the current body. Start disposes the old record before it stores the replacement.

For a Router SSR response, disposal releases Router SSR state and cancels the original SSR body.

If ownership moved to a different body, disposal also cancels that final body. This cancellation propagates through a pipe.

For a plain response, disposal cancels the current body.

Body cancellation is best effort. Start does not await it, and a cancellation failure does not block Router cleanup.

Cleanup paths can request disposal more than once. Router SSR cleanup and native stream cancellation have idempotent effects.

Every internal `SsrResponse` disposer must also have idempotent effects.

A result that settles after request cancellation is no longer usable. Start disposes that late result when it arrives.

## Locks, clones, and branches

Start checks the lock of the body that the current `Response` exposes when middleware returns a different response.

Start cannot cancel a locked body through `body.cancel()`. The code that acquired the reader owns that reader and must cancel or release it.

`Response.clone()` creates two body branches. It can also change the body object exposed by the original `Response`. Middleware should return the original response and read the clone. When middleware returns the clone, Start sees the original branch and continues the stream only while that branch is being read.

Start reads the current response body during disposal. It keeps only the original SSR body for Router cleanup.

Middleware owns every clone or `tee()` branch that it does not return. Middleware must consume or cancel each unused branch.

## Final handoff

Redirect conversion and `HEAD` handling dispose any body that they replace or remove.

Before returning a Router SSR stream, Start checks request cancellation. Start disposes the stream immediately if the request is already aborted.

Start binds later request cancellation to the disposer. While Router SSR state is live, SSR cleanup removes that listener. Otherwise the one-time listener ends with the request signal.

The Router stream transform releases Router SSR state after natural completion, stream errors, or consumer cancellation.

After handoff, the HTTP runtime owns consumption or cancellation of the returned body.

If Start does not hand off Router SSR ownership, the request cleanup block releases any remaining Router SSR state.

An abort can race with final handoff. Cleanup is idempotent. Either path can safely request cleanup.
