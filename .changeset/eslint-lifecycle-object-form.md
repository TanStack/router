---
'@tanstack/eslint-plugin-router': minor
---

Lint the lifecycle object form of `context`, `beforeLoad` and `loader`.

- `create-route-property-order` now also checks and fixes the key order inside the object form: `handler`, `dehydrate`, `hydrate`, then `revalidate` / `staleReloadMode`. Quoted keys (`'loader'`) are now checked and fixed like unquoted ones. Its fixer keeps the members it does not order (unknown and computed keys) instead of dropping them, and no longer throws on `...fn()` spreads. The fixer never moves a key across a spread or a computed key, since that can change which value wins, and a spread is never taken for the key its variable is named after. When the order can only be fixed by such a move, or when a comment belongs to a key in the range the fix reorders, the rule reports without fixing.
- All rules recognize `createRoute`, `createFileRoute` and the other factories through their import from a TanStack Router package, also under an alias or through a namespace import. A local binding with the same name, or a `createRoute` imported from another package, is not checked.
- New rule `no-lifecycle-codec-param-annotations`, enabled in the recommended configs: the parameters of `dehydrate`, `hydrate` and `revalidate` are inferred and must not be annotated.
