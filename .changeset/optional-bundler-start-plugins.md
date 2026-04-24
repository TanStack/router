---
'@tanstack/start-plugin-core': minor
'@tanstack/react-start': patch
'@tanstack/react-start-rsc': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Split Start plugin core bundler APIs into explicit Vite and Rsbuild subpaths so projects only need the bundler they use. Mark both `vite` and `@rsbuild/core` peers as optional where Start exposes both integrations.
