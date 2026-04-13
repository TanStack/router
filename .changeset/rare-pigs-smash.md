---
'@tanstack/start-plugin-core': patch
'@tanstack/react-start-rsc': patch
---

Fix Start virtual module resolution in pnpm workspaces by serving the client entry through a real Vite virtual module.

Simplify Start virtual module handling by sharing a single `createVirtualModule` helper and collapsing internal `@tanstack/start-plugin-core` imports to the root export surface.
