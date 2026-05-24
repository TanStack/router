---
'@tanstack/start-plugin-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Add Vite bundled dev mode support for TanStack Start. Start now recognizes Vite's `experimental.bundledDev` opt-in, uses the bundled dev client entry in the dev manifest, keeps server requests pointed at the latest client build output, and preserves import-protection behavior for bundled client dev.
