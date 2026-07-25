---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/react-start': patch
'@tanstack/solid-router': patch
'@tanstack/solid-start': patch
'@tanstack/vue-router': patch
'@tanstack/vue-start': patch
'@tanstack/router-plugin': patch
'@tanstack/virtual-file-routes': patch
'@tanstack/start-client-core': patch
'@tanstack/start-server-core': patch
---

feat: add TanStack Intent skills and fix publishing

- Fix `@tanstack/react-router` to publish skills (add `skills` to files array, `@tanstack/intent` devDep, bin entry)
- Add `tanstack-intent` keyword to all 11 skill-bearing packages for npm discoverability
- Create standalone `route-masking` skill (extracted from `not-found-and-errors`)
- Add TanStack Query composition skills for `solid-router` and `vue-router`
- Update `_artifacts/skill_tree.yaml` with all Start, framework, plugin, and new skills
