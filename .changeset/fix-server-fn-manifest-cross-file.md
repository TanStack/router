---
"@tanstack/start-plugin-core": patch
---

fix(start-plugin-core): register server functions reachable only from server-only code in the production manifest

When SSR is the server-function provider (the Vite default), a server function
reachable only from server-only code — e.g. a middleware `.server()` body or
another server function's handler — could be omitted from the generated server
function manifest. Calls then failed at runtime in production with
`Server function info not found for <id>`, while dev builds worked. This happened
because the resolver module is generated once and could be produced before those
functions had been discovered.

The server-function resolver now completes discovery of the reachable server
module graph (including provider modules, so handler-nested and external-package
server functions are covered) before generating the manifest.

Fixes #7213.
