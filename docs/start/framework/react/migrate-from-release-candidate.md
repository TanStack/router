---
id: migrate-from-release-candidate
title: Migrate from the Release Candidate
description: Upgrade a TanStack Start release-candidate app to the first stable release, 1.169.
---

`@tanstack/react-start` 1.169 is the first stable release of TanStack Start. Upgrading from a release candidate means replacing the removed APIs below and checking the behavior changes that apply to your app.

## Removed APIs

| Removed                                                | Use instead                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tanstack/nitro-v2-vite-plugin`                       | `nitro()` from `nitro/vite`. See [Nitro hosting](./guide/hosting#nitro).                                                                                                                                                                                                        |
| `useSession`                                           | A session library such as iron-session. See [Session Management](./guide/authentication#2-session-management). The new library cannot read existing Start session cookies: use a new cookie name and sign users in again, or test a migration that reads the old cookies first. |
| `.inputValidator()` on server functions and middleware | `.validator()`, which takes the same validator.                                                                                                                                                                                                                                 |

## Errors

- A handler returned by `createStartHandler(...)` now rethrows the original error. `createServerEntry` converts errors to responses, and the built-in entry already uses it. In a custom entry, catch inside the `createServerEntry` callback and `return handleStartError(error)` or rethrow. See [Error Handling](./guide/server-entry-point#error-handling).
- Uncaught errors produce a generic JSON body with a status from `400` to `599` (`500` by default), even if a success status was set before the error. Return a `Response` when an endpoint needs a specific error payload.
- A server-function call rejects with whatever was thrown, including a `Response` and falsy values such as `undefined`. Return a `Response` to resolve the call with it. See [Raw Responses](./guide/server-functions#raw-responses).
- Errors thrown by request middleware during a server-function call are sent to the client with their message, and their status is no longer always `500`.

## Responses

- Response helpers override the response you return or throw. `setResponseStatus(401)` followed by returning a `200` response sends `401`.
- `setResponseHeader('set-cookie', cookie)` replaces all outgoing cookies. Use `setCookie` or `appendResponseHeader('set-cookie', cookie)` to add one.
- `setResponseStatus` ignores codes outside `200`-`599` and warns outside production.
- Serialized server-function replies never carry `Location`, `Content-Encoding`, or `Content-Length` from helpers, and ignore a helper `204`, `205`, or `304`. Use `redirect()` to redirect.

## Requests and middleware

- `getRequestHeader(name)` returns `''` for a header that is present but empty, and `undefined` only when it is missing.
- A path with invalid percent-encoding, such as `/%E0%A4%A`, gets `400 Bad Request` before your server entry or middleware runs.
- When no function middleware sends context, `sendContext` is `undefined` instead of `{}`.
