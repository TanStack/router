---
'@tanstack/react-start': major
'@tanstack/solid-start': major
'@tanstack/vue-start': major
'@tanstack/start-server-core': major
'@tanstack/react-start-server': major
'@tanstack/solid-start-server': major
'@tanstack/vue-start-server': major
---

Remove the built-in `useSession` API. Applications choose a session library, such as iron-session, and save or destroy sessions explicitly before returning or redirecting. Connect a cookie adapter through `getCookie` and `setCookie`, or append serialized cookies with `appendResponseHeader('set-cookie', cookie)`. Existing session cookies require a deliberate migration or signing in again with a new cookie name.

`createServerEntry` keeps the complete callback, including custom error handling, inside the request context and converts errors that escape it. The built-in entry still converts errors automatically. Raw `createStartHandler` handlers now rethrow the original error. For custom reporting, catch inside `createServerEntry`, then rethrow for default conversion or return `handleStartError(error)` to preserve response-helper status, headers, and cookies. Return an explicit `Response` when choosing a custom error payload.

Response helpers now apply consistently across server routes, SSR, server functions, redirects, errors, and middleware response replacements. Helper setters override returned values; cookie helpers preserve independent cookies and replace matching cookie identities. Use `appendResponseHeader('set-cookie', cookie)` when adding a serialized cookie without replacing other cookies. Changed responses receive copied headers and reuse the body stream, so applications should inspect the response returned by Start rather than relying on mutation of the original response.
