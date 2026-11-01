---
id: route-module-imports
title: Ensure route modules import routing APIs from their route scope
---

> [!WARNING]
> This rule supports [route modules](../routing/route-modules.md), which are experimental. The rule may change with them in any release.

Files of a [route module](../routing/route-modules.md) must import routing and Start APIs from the module's generated route scope (`routeScope.gen.ts`), which types them against the module's own routes. The same APIs imported from `@tanstack/react-router`, `@tanstack/solid-router`, `@tanstack/vue-router` or the framework's Start package are typed against an application the module does not know.

The rule reports value imports of these APIs from the framework packages:

- Route constructors and routing APIs: `createFileRoute`, `Link`, `createLink`, `linkOptions`, `Navigate`, `useNavigate`, `redirect`, `MatchRoute`, `useMatchRoute`, `useRouter`, `getRouteApi`, `useMatch`, `useMatches`, `useParentMatches`, `useChildMatches`, `useLoaderData`, `useLoaderDeps`, `useSearch`, `useParams`, `useRouteContext`, `useLocation` and `useRouterState`.
- Root route constructors (`createRootRoute`, `createRootRouteWithContext`): a module root is created with `createModuleRoot`.
- Start APIs of Start route modules: `createServerFn` and `createStartModule`.

The rule only applies to files whose nearest `package.json` declares `tanstack.router.module`. It ignores generated files and type-only imports.

## Rule Details

Examples of **incorrect** code for this rule:

```tsx title="packages/products/src/routes/$productId.tsx"
/* eslint "@tanstack/router/route-module-imports": "error" */
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('@acme/products:/$productId')({
  component: () => <Link to="/">All products</Link>,
})
```

Examples of **correct** code for this rule:

```tsx title="packages/products/src/routes/$productId.tsx"
/* eslint "@tanstack/router/route-module-imports": "error" */
import { Outlet } from '@tanstack/react-router'
import { createFileRoute, Link } from '../routeScope.gen'

export const Route = createFileRoute('@acme/products:/$productId')({
  component: () => <Link to="/">All products</Link>,
})
```

## Attributes

- [x] ✅ Recommended
- [ ] 🔧 Fixable
