---
'@tanstack/router-core': patch
---

Treat URLs on a custom-protocol origin (such as `tauri://localhost` in a Tauri webview) as internal. With a `basepath`, every location on that origin was classified as external, so the initial route stayed pending and `buildLocation` returned an absolute `publicHref`.
