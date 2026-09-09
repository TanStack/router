---
'@tanstack/router-core': patch
'@tanstack/router-plugin': patch
'@tanstack/start-client-core': patch
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
'@tanstack/start-static-server-functions': patch
---

Compile the code-splitting grouping schema and avoid temporary arrays when checking for duplicate nodes.

Skip Zod validation for Rspack modules without server-function metadata.
