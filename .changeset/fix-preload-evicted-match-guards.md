---
'@tanstack/router-core': patch
---

fix(router-core): guard against evicted matches during in-flight preloads

When a preload's cached match is evicted while its async work is still in flight (e.g. the cache is cleared, garbage-collected, or the user navigates mid-preload), the load pipeline re-looked-up the match after each `await` with a non-null assertion and crashed with `TypeError: Cannot read properties of undefined (reading '_nonReactive')`. The re-lookups are now guarded, and the post-load cleanup falls back to the matched object so in-flight promises still settle and concurrent loads awaiting them don't hang.

Fixes #7759.
