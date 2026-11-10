---
'@tanstack/start-plugin-core': patch
---

Rsbuild with RSC: import protection judges the file an import resolves to in the RSC layer, where Rspack resolves with the `react-server` condition. A package or `package.json` `imports` entry whose `react-server` and default conditions name different files was judged by the default file: a client-only file only the default condition names failed the build (or was mocked in dev), and a denied file only `react-server` names was reported as an import another plugin added.
