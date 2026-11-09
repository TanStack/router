---
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
---

A Vite build that builds the server environment before the client environment, or without it (a plugin's `buildApp`, a hand-written `createBuilder()`), fails with a message saying to build the client first. It used to succeed with a server that answered no client call of a server function.

A Vite build no longer hangs on a virtual module with a `server-only` marker, or on virtual modules importing each other: it fails, naming the modules.

webpack, Rspack and Rsbuild: source maps of compiled modules count lines at line feeds only, as these bundlers do; a raw U+2028, U+2029 or lone carriage return in a module no longer shifts the mapped lines after it by one.

Rsbuild dev on Windows: an edit whose dependents rebuild in the server environment is invalidated once, not again for each dependent.
