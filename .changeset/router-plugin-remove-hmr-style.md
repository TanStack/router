---
'@tanstack/router-plugin': patch
---

Remove the undocumented `plugin.hmr.style` option and the `HmrOptions` type. Each bundler entry now picks its own HMR runtime: the webpack and Rspack entries already forced `'webpack'`, and on Vite, `'webpack'` broke route HMR.
