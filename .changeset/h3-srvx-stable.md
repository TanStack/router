---
'@tanstack/start-server-core': patch
'@tanstack/start-plugin-core': patch
---

Update `h3` to 2.0.1 and `srvx` to 1.0.5. Requests with malformed percent-encoded paths (e.g. `/%80`) still respond with 400 Bad Request.

Behavior changes from h3 2.0.1:

- `getRequestProtocol()` and `getRequestUrl()` only read `x-forwarded-proto` when called with `{ xForwardedProto: true }`.
- Session cookies default to `SameSite=Lax`, and `getSession()` no longer sets a cookie for a new session until the session is updated.
- Sessions are sealed with more PBKDF2 iterations. Existing session cookies are still accepted and re-sealed on the next request.
