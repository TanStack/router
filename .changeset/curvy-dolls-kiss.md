---
'@tanstack/start-plugin-core': minor
'@tanstack/start-client-core': minor
'@tanstack/router-core': patch
---

Add `serverFns.transport: 'bundled' | 'lazy'` to the Start bundler plugins. Bundled keeps the codec in the initial bundle; lazy loads Seroval and response decoding on invocation and overlaps payload-free requests with that download.
