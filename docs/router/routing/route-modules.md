---
id: route-modules
title: Route Modules (Experimental)
---

> [!WARNING]
> Route modules are experimental. Their APIs, generated files, `package.json` fields, CLI commands and TanStack Start integration may change in any release, including minor and patch releases. Pin your TanStack Router versions when you adopt them.

A **route module** is a workspace package that owns a subtree of file-based routes. Applications, and other route modules, mount it into their route tree. Each module is generated and type-checked by its own package, and links into it stay fully typed wherever it is mounted.

Use route modules when several teams or applications share routes in a monorepo:

- A feature (a product catalog, an account area) lives in its own package with its own routes, loaders and components.
- Applications choose where a module is mounted, so the same module can appear at `/shop/products` in one app and at `/catalog` in another.
- A module only sees what it declares: its own routes, the modules it mounts or uses, and the router context it requires.

Route modules are opt-in. Applications without them are generated exactly as before.

> [!NOTE]
> Route modules require TypeScript, and the generator rejects `disableTypes`. Lazy route files (`createLazyFileRoute`, `.lazy.tsx`) are not supported in route modules: [automatic code splitting](../guide/automatic-code-splitting.md) splits module routes like any other route.

## Declaring a route module

A package is a route module when its `package.json` has a `tanstack.router.module` field:

```json title="packages/products/package.json"
{
  "name": "@acme/products",
  "type": "module",
  "tanstack": {
    "router": {
      "module": {}
    }
  },
  "exports": {
    "./route-types": {
      "types": "./.tanstack/types/src/routeContract.gen.d.ts"
    },
    "./route-module": {
      "types": "./.tanstack/types/src/routeModule.gen.d.ts",
      "default": "./src/routeModule.gen.ts"
    },
    "./package.json": "./package.json"
  },
  "scripts": {
    "generate": "tsr generate",
    "build:types": "node -e \"require('node:fs').rmSync('.tanstack/types', { recursive: true, force: true })\" && tsc -p tsconfig.route-types.json",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-router": "^1.0.0"
  },
  "devDependencies": {
    "@tanstack/router-cli": "^1.0.0",
    "typescript": "^5.6.0"
  }
}
```

The module's identity is its `package.json` name. Generated route IDs use that
name as their prefix, for example `@acme/products:/$productId`.

The module field accepts these options. `true` is the same as `{}`.

| Option     | Description                                                                |
| ---------- | -------------------------------------------------------------------------- |
| `includes` | Modules installed into this module's tree, with includer-owned mount paths |
| `uses`     | Explicit references to other modules' routes; defaults to an empty list    |

The two `exports` entries are the module's public surface:

- `./route-types` points to the emitted declarations of the module's contract: its router type and route ids. Consumers only read these declarations, never the module's sources.
- `./route-module` points to the module's runtime entry, which includers mount. Applications compile it from source like any other workspace code.

Route ids and module-local paths are part of this public surface. Consumers reference them in `getRouteApi`, `useMatch`, namespaced links and `isScopedMatch`, so renaming or moving a route file is a breaking change for them, like renaming an export.

The package build must verify that its exported declarations and their imports resolve in consumers. Build and check declarations before publishing, including a consumer with `skipLibCheck: false` and no provider source files.

Declarations are emitted with a `tsconfig.route-types.json` that you own:

```json title="packages/products/tsconfig.route-types.json"
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "noEmitOnError": true,
    "declarationMap": true,
    "rootDir": ".",
    "outDir": ".tanstack/types"
  },
  "include": ["src"]
}
```

## Authoring module routes

Module routes live in the module's routes directory as usual. Two things differ from an application:

1. **Import routing APIs from the generated scope.** `src/routeScope.gen.ts` exports `createFileRoute`, `createModuleRoot`, `Link`, `useNavigate`, `redirect`, the hooks and `useRouter`, all typed against the module's own routes. Imports from `@tanstack/react-router` would be typed against an application the module does not know. The [`route-module-imports`](../eslint/route-module-imports.md) lint rule enforces this.
2. **Route ids are qualified with the module id.** The generator writes them, exactly as it writes ids in an application.

```tsx title="packages/products/src/routes/$productId.tsx"
import { createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute('@acme/products:/$productId')({
  loader: ({ params, context }) =>
    context.productsApi.getProduct(params.productId),
  component: ProductPage,
})

function ProductPage() {
  const product = Route.useLoaderData()
  return (
    <section>
      <h1>{product.name}</h1>
      {/* Module-local path: resolves to wherever the module is mounted. */}
      <Route.Link to="/">All products</Route.Link>
    </section>
  )
}
```

Paths inside a module are **module-local**. `to="/"` is the module's index route, whether the module is mounted at `/products` or `/shop/catalog`.

### The module root and its requirements

`src/routes/__root.tsx` creates the module root with `createModuleRoot`. Its type parameter is the router context the module requires from wherever it is mounted:

```tsx title="packages/products/src/routes/__root.tsx"
import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'
import type { ProductsApi } from '../api'

export const Route = createModuleRoot<{ productsApi: ProductsApi }>()({
  component: () => <Outlet />,
})
```

The module type-checks on its own against this requirement. When an application mounts the module, the mount fails to type-check unless the parent route provides that context. It does not matter whether the context comes from the application's root, `createRouter({ context })`, or a layout's `beforeLoad`.

Shared libraries with nominal types, such as a `QueryClient` class, must resolve to one declaration in the whole workspace. Make them `peerDependencies` of route modules.

## Mounting modules

An application mounts modules with the `routeModules` option. It is accepted by `tsr.config.json`, the bundler plugin and the `router` option of TanStack Start:

```json title="apps/web/tsr.config.json"
{
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts",
  "routeModules": {
    "includes": [
      { "module": "@acme/storefront", "at": "/shop" },
      {
        "module": "@acme/account",
        "parent": "/_authenticated",
        "at": "/account"
      }
    ]
  }
}
```

A route module mounts other modules with `includes` in its own `package.json`. A string entry mounts the module under the root without adding a path segment. Use an object to select the mount and installation name:

| Field    | Description                                                                    |
| -------- | ------------------------------------------------------------------------------ |
| `module` | Package name of the module, declared as a dependency of the includer           |
| `parent` | Host route ID; defaults to the root                                            |
| `at`     | Static path below the parent; defaults to no additional segment                |
| `as`     | Generated namespace and installation name, including for a single installation |

The includer owns the URL. Relative and leading-slash `at` spellings are normalized as paths below the selected parent before collision checks.

Mounting follows these rules, and the generator or the type checker reports every violation:

- **The host chain has no required search params.** Links carry the path params of the current location over, but not its search params, so a module's own links could not provide them. Routes above a module may have path params (see [Mounting under path params](#mounting-under-path-params)). `at` itself must be a static path.
- **The parent provides the context the module root requires.**
- **A module is mounted once per route tree,** unless an application names several installations of it (see [Installing a module several times](#installing-a-module-several-times)). Several includers can depend on the same module, but only one of them can mount it. The others use it.
- **Each package declares its direct providers.** Declare the modules it mounts or uses as dependencies. Generated declarations reference those providers' symbolic contracts; each provider resolves its own dependencies from its package. An application need not list every transitive module as a direct dependency. The package declaration build reports unresolved imports.
- **Full paths must not collide** with routes of the includer or other modules.

Generated code performs the mounting and emits the corresponding type checks. Mounting helpers are internal; author composition through configuration and generated APIs.

### Mounting under path params

A module can be mounted below routes with path params, for example once per organization:

```json title="apps/web/tsr.config.json"
{
  "routeModules": {
    "includes": [
      { "module": "@acme/team", "parent": "/orgs/$orgId", "at": "/team" }
    ]
  }
}
```

The module never sees `orgId` in its types: its own links keep the path params of the current location, which always has them while the module renders. At runtime `useParams()` and `match.params` contain them, like the final paths in `match.fullPath`. Whatever an installation needs about its host comes through the context its root requires, which the host route provides:

```tsx title="apps/web/src/routes/orgs.$orgId.tsx"
export const Route = createFileRoute('/orgs/$orgId')({
  beforeLoad: ({ params }) => ({ org: { id: params.orgId } }),
})
```

The includer's namespace for the module is typed from where it is mounted, so links from outside the module pass the host params:

```tsx
<team.Link to="/members/$memberId" params={{ orgId: 'acme', memberId: 'ada' }}>
  Ada
</team.Link>
```

A module that only uses a module mounted under path params fills them from the current location, so the generator requires it to be mounted below the routes that declare them. It reports a using module mounted elsewhere, naming both modules and the routes with the params.

### Installing a module several times

An application can install a module more than once, for example the same settings per organization and per person. Every include of the module names its installation with `as`:

```json title="apps/web/tsr.config.json"
{
  "routeModules": {
    "includes": [
      {
        "module": "@acme/settings",
        "parent": "/orgs/$orgId",
        "at": "/settings",
        "as": "orgSettings"
      },
      {
        "module": "@acme/settings",
        "parent": "/people/$personId",
        "at": "/settings",
        "as": "personSettings"
      }
    ]
  }
}
```

Each installation gets its own routes, with ids `<moduleId>#<as>:<path>` such as `@acme/settings#orgSettings:/profile`. They share the module's components, loaders and code-split chunks, and a hot update reaches every installation. An explicitly named single installation uses this identity too. Only an unnamed single installation uses `<moduleId>:<path>`, so adding another installation does not rename an existing named one.

The module's code does not change. Its route ids, `Route` APIs, links, navigation and redirects resolve to the installation it renders under. Configure each installation through the context the module root requires: each host route provides its own.

Outside the module, address one installation at a time:

- **Through its namespace.** The application gets a namespace per installation, named by `as`. It takes the module's local paths and ids and addresses that installation: `orgSettings.Link`, `orgSettings.getRouteApi('@acme/settings:/profile')`.
- **By its installation ids.** `useMatch({ from: '@acme/settings#orgSettings:/profile' })`. The module's plain ids (`@acme/settings:/profile`) are type errors outside the module.

A module that uses a module installed several times links to the installation whose host routes are above its own mount: a billing module mounted below `/orgs/$orgId` links to `orgSettings`. The generator reports a using module with no such installation, or with several.

Only applications install a module several times. A module installed several times cannot itself install other modules.

## Linking across modules

Every module the includer mounts or uses gets a **namespace** in its `routeScope.gen.ts`. A namespace has the same APIs as the module's own scope, typed against that module's local paths:

```tsx title="apps/web/src/routes/index.tsx"
import { createFileRoute } from '@tanstack/react-router'
import { products } from '../routeScope.gen'

export const Route = createFileRoute('/')({
  component: () => (
    <products.Link to="/$productId" params={{ productId: 'home-pick' }}>
      Pick of the day
    </products.Link>
  ),
})
```

The namespace name is the last segment of the package name in camel case. Choose another with `as` when two modules would get the same name.

In `includes`, `as` also names the installation. In a `uses` reference, `{ "module": "@acme/products", "as": "catalog" }` only renames the local namespace; it does not create or rename an installation.

An application cannot link to a module route by its final path: `<Link to="/shop/products/$productId">` is a type error. This keeps modules independent of where they are mounted.

APIs that take a route id work across modules with qualified ids:

```tsx
const productApi = getRouteApi('@acme/products:/$productId')
const match = useMatch({ from: '@acme/products:/$productId' })
```

A module can reference another module's routes without mounting it by listing it in `uses`:

```json title="packages/account/package.json"
{
  "name": "@acme/account",
  "tanstack": {
    "router": {
      "module": { "uses": ["@acme/products"] }
    }
  },
  "dependencies": { "@acme/products": "workspace:*" }
}
```

The application must install that provider somewhere, directly or through an include. The generator reports a reference whose provider is not installed. A dependency used only for schemas, utilities or server functions needs no `uses` entry and imposes no route-installation requirement. Dependencies are resolved as packages; they are not automatically discovered as route consumers. An include already exposes its installed subtree, so it need not be repeated in `uses`.

Namespaces are read-only generated ESM namespaces. Each API and namespace can be tree-shaken independently: using `products.Link` should not retain every routing helper. Do not mutate namespace members.

Options created by a scope retain their ownership. Reuse `products.linkOptions(...)` with the products APIs; passing them to a conflicting scope is rejected instead of silently changing their destination.

### Match identity and whole-router state

`match.routeId` is the final installed ID. Module matches also carry `match.localRouteId`, for example `@acme/settings:/profile` even when the final ID is `@acme/settings#orgSettings:/profile`. Ordinary application matches omit this property.

Scoped `useMatches` keeps the whole active match chain, including foreign host routes. Those foreign matches retain common metadata, but their loader data and context are `unknown`. Narrow membership before using module-specific data. `isScopedMatch` accepts every route of the modules in the scope, identified by their module id, including routes a module adds later:

```ts
import { isScopedMatch, useMatches } from '../routeScope.gen'

for (const match of useMatches()) {
  if (
    isScopedMatch(match) &&
    match.localRouteId === '@acme/settings:/profile'
  ) {
    const profile = match.loaderData
  }
}
```

Known-route APIs such as `useMatch({ from: ... })` retain precise types. Constructing `getRouteApi(...)` at module scope is valid; its hooks resolve the nearest installation when called in a component. An ambiguous lookup outside a matching context needs an explicit installation.

The generated scope also includes `useLinkProps`, `useBlocker` and targeted `notFound`. `useBlocker` observes whole-router transitions. Import `Outlet` from the framework package. `Navigate` navigates on mount and on option changes across React, Solid and Vue; it does not navigate during SSR.

Generated validation type aliases bind the module's router while retaining the corresponding framework type's other argument order and defaults:

- `ValidateLinkOptions` and `ValidateLinkOptionsArray`
- `ValidateNavigateOptions` and `ValidateNavigateOptionsArray`
- `ValidateRedirectOptions` and `ValidateRedirectOptionsArray`
- `ValidateUseSearchOptions` and `ValidateUseParamsOptions`
- `ValidateId`, `ValidateFromPath`, `ValidateToPath`, `ValidateSearch` and `ValidateParams`

> [!NOTE]
> A module match's `fullPath` is the final installed path pattern and is typed as `string`; the paths accepted by its generated APIs are module-local. Read `match.pathname` for the current concrete URL. Module source route objects are shared definitions, so use the current match when you need an installation's identity or path.

## Generated files

| File                                 | Purpose                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `src/routeTree.gen.ts`               | Full route tree and type maps                                                |
| `src/routeTree.gen.client.ts`        | Provider-owned client view used by Start's client bundlers                   |
| `src/routeScope.gen.ts`              | Module-scoped exports and namespace re-exports                               |
| `src/routeScope.gen.namespace<N>.ts` | Independent ESM exports for a referenced installation                        |
| `src/routeContract.gen.ts`           | Public route contract, exposed as `./route-types` after declaration emission |
| `src/routeModule.gen.ts`             | Runtime entry exposed as `./route-module`                                    |
| `src/startModules.gen.ts`            | Start contributions and erased application contract checks                   |
| `.tanstack/route-module.json`        | Portable route/source topology, installation metadata and client-view paths  |
| `.tanstack/types/`                   | Example declaration output directory, owned by the package build             |

The generated files sit beside the configured route tree. Do not edit them. They can be committed or ignored; generation must precede any task that reads them. Add `.tanstack` to `.gitignore`.

Package runtime exports must retain every referenced route source or compiled JavaScript file, generated namespace/client-tree file and topology manifest. Declaration exports must retain their complete reachable declaration graph. Keep framework versions compatible with the generated source's internal implementation imports.

## Building and watching

Router generates routes; the package's TypeScript build emits and checks declarations; a task runner schedules, caches and reruns those operations when inputs change.

| Command                            | Responsibility                                                  |
| ---------------------------------- | --------------------------------------------------------------- |
| `tsr generate`                     | Generate the package's route topology, source APIs and manifest |
| `tsc -p tsconfig.route-types.json` | Emit declarations with the package's own compiler project       |
| `tsc --noEmit`                     | Check a package's sources against current provider declarations |

A declaration build should clean its configured output first, because TypeScript does not remove declarations for deleted source files. The example `build:types` script above owns that cleanup. A failed build must fail the task graph. Router has no declaration-status file, compiler wrapper or stale-output health check.

Order work by the route-package dependency graph:

1. Generate providers before packages that include or reference them.
2. Emit provider declarations before emitting or checking consumers.
3. Regenerate packages that include or reference a provider after its topology changes; recheck consumers after contract changes.
4. Build the application from the resulting artifacts.

An implementation edit can produce identical declaration bytes. Whether that suppresses a consumer task depends on the task runner's cache policy, not Router.

Router CLI and bundler plugins require Node.js 22.22.0 or later.

### Nx and Turborepo

Expose ordinary `generate`, `build:types` and `check` package scripts. For example, an Nx graph can start with these uncached targets:

```json title="nx.json"
{
  "targetDefaults": {
    "generate": { "cache": false, "dependsOn": ["^generate"] },
    "build:types": {
      "cache": false,
      "dependsOn": ["generate", "^build:types"]
    },
    "check": {
      "cache": false,
      "dependsOn": ["generate", "^build:types"]
    }
  }
}
```

The equivalent Turborepo tasks use `dependsOn: ["^generate"]` for generation and `dependsOn: ["generate", "^build:types"]` for declaration builds/checks. Use the task runner's watch mode to rerun these finite tasks in dependency order.

Configure that workflow to react to route source and generation-config changes, module `package.json` metadata, and Start-entry additions or removals beside the configured route tree. A provider topology change must regenerate packages that include or reference it. Provider declaration changes must rebuild or recheck their consumers. Include custom generated directories and TypeScript project inputs in the task configuration.

`tsr watch` remains available for standalone route-directory and configuration watching. Route-module development uses the workspace task runner to watch the complete build graph and invoke `tsr generate`.

When enabling caches, model every source/configuration and provider artifact a task reads. Restore every generated scope/namespace/client-tree file, the topology manifest, the complete declaration output/maps and the intended runtime output. Match custom generation directories and declaration `outDir` settings. A task whose inputs include ignored generated workloads must model those inputs or remain uncached. Cache hits must restore the same usable package as a successful uncached run.

The application bundler compiles module runtime source and handles code splitting/HMR. It also consumes provider manifests; it does not generate into provider packages. Run the workspace task watcher alongside the application dev server so provider artifacts stay current.

## TanStack Start

Route modules work in TanStack Start applications. A module can declare type-only Start context requirements and can separately contribute an executable **Start fragment** that the application installs. See [Route Modules in TanStack Start](../../start/framework/react/guide/route-modules.md).

A module without Start features can be mounted in a Start application as is. When the application renders on the server, the mount checks that the loader and `beforeLoad` results of the module's routes can be serialized.

## Migrating from a router package

The `router-monorepo-*` examples share one router between packages: a router package builds the route tree from routes defined in feature packages and registers it globally. To move a feature package to a route module:

1. Move its routes into `src/routes` of the package and add `tanstack.router.module` and the `exports` entries to its `package.json`.
2. Replace route constructors and routing APIs imported from the framework package with imports from `./routeScope.gen`. Create the root with `createModuleRoot` and declare the context the routes need.
3. Replace absolute paths that pointed into other features, in the features and in the application, with their namespaces. The type checker reports each one:

   ```tsx
   // Before
   <Link to="/shop/products/$productId" params={{ productId }} />
   // After
   <products.Link to="/$productId" params={{ productId }} />
   ```

4. Mount the module from the application with `routeModules.includes`, and remove the hand-written route tree assembly and the shared `Register` augmentation.
5. Declare cross-module route references in `uses`. Add generation, ordinary declaration-build and source-check tasks in dependency order.

## Limitations

- Route modules require TypeScript and emit declarations with the module's own compiler. TypeScript 5.6 or newer is supported.
- Consumer declarations use `moduleResolution: "bundler"`. `node16`/`nodenext` compatibility is not supported by this workflow.
- A module is mounted at a static path, under a host chain without required search params. Only applications install a module more than once, and a module installed several times cannot install other modules.
- A module that another module installs cannot link to a module the application installs several times.
- Lazy route files are not supported in route modules.
- `Register.server.requestContext` of TanStack Start stays global to the application.
- Mixed code-based and file-based route-module composition is a future TODO. Use generated file-based composition for now; the mounting and scope factories remain internal. Existing physical/virtual file-routing configuration remains supported.
- Router instances own their runtime state, including request-specific SSR state; shared module definitions must not store user context.
