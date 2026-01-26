---
name: TanStack Router
description: Build and maintain Router routing with file-based, code-based, and virtual route trees.
version: 1
---

# TanStack Router

Use this skill when working on TanStack Router routing behavior, configuration, and integrations.

## When to use

- Add or change routes and route trees
- Apply routing file conventions or code-based routing
- Configure file-based routing generation options
- Integrate Router with TanStack Query or enforce lint rules

## Core references

| Area                | Description                           | Reference                                        |
| ------------------- | ------------------------------------- | ------------------------------------------------ |
| API overview        | Router functions, components, hooks   | references/api-overview.md                       |
| Routing concepts    | Core route types and conventions      | references/routing-concepts.md                   |
| File-based routing  | Directory, flat, and mixed routing    | references/routing-file-based.md                 |
| File naming         | Naming tokens and file rules          | references/routing-file-naming.md                |
| Code-based routing  | Manual route tree composition         | references/routing-code-based.md                 |
| Route trees         | Route tree structure and config       | references/routing-route-trees.md                |
| Route matching      | Match ordering and specificity        | references/routing-route-matching.md             |
| Search params       | Validation, reading, and updates      | references/routing-search-params.md              |
| Path params         | Dynamic segments and optional params  | references/routing-path-params.md                |
| Navigation          | Link, navigate, and matching checks   | references/routing-navigation.md                 |
| Link options        | Reusable link option objects          | references/routing-link-options.md               |
| Data loading        | Loaders, cache, and pending UI        | references/routing-data-loading.md               |
| Deferred data       | Streaming deferred loader data        | references/routing-deferred-data.md              |
| External data       | Integration with data libraries       | references/routing-external-data.md              |
| Data mutations      | Mutation patterns and invalidation    | references/routing-data-mutations.md             |
| Preloading          | Route preloading strategies           | references/routing-preloading.md                 |
| Route masking       | Masked URLs and temp locations        | references/routing-route-masking.md              |
| Not found           | NotFound behavior and handling        | references/routing-not-found.md                  |
| Router context      | Context injection and typing          | references/router-context.md                     |
| Document head       | Head management APIs                  | references/router-document-head.md               |
| SSR                 | Server rendering modes and APIs       | references/router-ssr.md                         |
| Code splitting      | Lazy routes and splitting rules       | references/router-code-splitting.md              |
| Auto code splitting | Plugin-based splitting config         | references/router-auto-code-splitting.md         |
| Navigation blocking | Blocking and confirmations            | references/router-navigation-blocking.md         |
| Custom Link         | createLink wrappers for UI kits       | references/router-custom-link.md                 |
| Outlets             | Render child routes                   | references/router-outlets.md                     |
| Scroll restoration  | Scroll keys and restore behavior      | references/router-scroll-restoration.md          |
| History types       | Browser, hash, and memory history     | references/router-history-types.md               |
| Type safety         | Router type registration and tips     | references/router-type-safety.md                 |
| Virtual file routes | Programmatic route tree config        | references/routing-virtual-file-routes.md        |
| File-based API      | Config options for file-based routing | references/api-file-based-routing.md             |
| Query integration   | SSR query integration for Router      | references/integration-query.md                  |
| ESLint rule         | Route property order rule             | references/eslint-create-route-property-order.md |

## Scope boundaries

- Router skills cover routing mechanics and Router APIs.
- Start-specific server functions, hosting, or execution model belong in skills-start.
