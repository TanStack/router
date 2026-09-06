---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Fix route-scoped `useMatch`, `useSearch`, and `useParams` APIs to forward the `shouldThrow` option and preserve optional return types when `shouldThrow: false`.
