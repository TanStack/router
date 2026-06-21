---
'@tanstack/react-router': minor
'@tanstack/solid-router': minor
'@tanstack/vue-router': minor
---

feat: add `isBot` option to `renderRouterToStream` to configure streaming SSR bot detection

Streaming SSR waits for the full document (React's `allReady`) for requests that `isbot` flags by their `User-Agent`, and streams the shell first for everyone else. This was hardcoded, so performance auditors (Lighthouse, PageSpeed Insights, WebPageTest, …) — which `isbot` classifies as bots — were measured on the buffered path instead of the streaming path real users get.

`renderRouterToStream` now accepts an `isBot` option so the decision can be made in the server request handler (it lives in `ssr/server` and never ships to the client). The default is unchanged.

- `undefined` (default): use the built-in `isbot` User-Agent check.
- `boolean`: force the bot (`true`) or non-bot (`false`) path for the request.
- `(request) => boolean`: provide a custom predicate.

```tsx
import {
  createRequestHandler,
  renderRouterToStream,
  RouterServer,
} from '@tanstack/react-router/ssr/server'

createRequestHandler({ request, createRouter })(
  ({ request, router, responseHeaders }) =>
    renderRouterToStream({
      request,
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
      isBot: false,
    }),
)
```
