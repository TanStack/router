---
'@tanstack/router-devtools-core': patch
---

Fix broken styling of the embedded `TanStackRouterDevtoolsPanel` (including inside shadow DOM) by giving the devtools size tokens a `1rem` fallback when `--tsrd-font-size` is not set.
