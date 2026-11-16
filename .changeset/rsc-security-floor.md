---
'@tanstack/react-start-rsc': patch
---

Raise the minimum RSC bundler peer dependencies to versions with the React Server Components fixes for GHSA-xqc2-xf4c-x3h3 (CVE-2026-126187, unauthenticated RCE) and GHSA-h3gv-c5rc-p453 (server function DoS):

- `@vitejs/plugin-rsc` to `>=0.5.38` (GHSA-59pf-q495-3c99), which vendors a fixed `react-server-dom-webpack`.
- `react-server-dom-rspack` to `>=0.1.1`, the first release built from React sources that include the fix.
