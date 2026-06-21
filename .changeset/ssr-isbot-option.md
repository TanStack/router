---
'@tanstack/router-core': minor
'@tanstack/react-router': minor
'@tanstack/solid-router': minor
'@tanstack/vue-router': minor
---

feat: add `ssr.isBot` router option to configure streaming SSR bot detection

Streaming SSR waits for the full document (React's `allReady`) for requests that `isbot` flags by their `User-Agent`, and streams the shell first for everyone else. This was hardcoded, so performance auditors (Lighthouse, PageSpeed Insights, WebPageTest, …) — which `isbot` classifies as bots — were measured on the buffered path instead of the streaming path real users get.

The new `ssr.isBot` router option overrides that decision while keeping the current behavior by default:

- `undefined` (default): unchanged — use the built-in `isbot` User-Agent check.
- `boolean`: force the bot (`true`) or non-bot (`false`) path for every request.
- `(request) => boolean`: provide a custom predicate.
