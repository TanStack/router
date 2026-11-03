---
id: route-modules
title: Route Modules (Experimental)
---

Start build tooling requires Node.js 22.22.0 or later.

> [!WARNING]
> Route modules are experimental. Their APIs, generated files and build integration may change in any release, including minor and patch releases. Pin your TanStack Start versions when you adopt them.

[Route modules](../../../../router/routing/route-modules.md) are packages that own a subtree of file-based routes. A module that depends on `@tanstack/react-start` also receives generated Start APIs. The same design applies to Solid and Vue through their framework packages.

```json title="packages/catalog/package.json"
{
  "name": "@acme/catalog",
  "tanstack": { "router": { "module": {} } },
  "dependencies": {
    "@tanstack/react-router": "^1.0.0",
    "@tanstack/react-start": "^1.0.0"
  }
}
```

Use `createServerFn`, `createMiddleware` and `createStartModule` from the module's generated `routeScope.gen.ts`. These APIs select the module's requirements and serialization types. The application continues to import its APIs from `@tanstack/react-start`.

## Declare required context with types

Requirements describe context that the host must provide. Augment `StartModuleRequirements` in the framework package, keyed by the module's package name:

```ts title="packages/catalog/src/requirements.ts"
export type { StartModuleRequirements } from '@tanstack/react-start'

interface User {
  id: string
}

declare module '@tanstack/react-start' {
  interface StartModuleRequirements {
    '@acme/catalog': {
      requestContext: { user: User }
      functionContext: { permissions: Array<string> }
    }
  }
}
```

The two fields are optional and independent:

- `requestContext` is available during requests and server functions. The application can supply it through `handler.fetch` context or request middleware.
- `functionContext` is required by server functions and their server middleware. Global function middleware can provide it, in addition to the request context already available at that stage. It does not describe client middleware or context sent over the transport.

The generated application assertion selects installed route modules. An application's unrelated dependency does not impose a requirement merely because TypeScript loads its types. Installing a module more than once reuses its package's requirement. Explicitly consuming module middleware also checks its requirements at that consumer.

These declarations emit no JavaScript and need no runtime marker, middleware entry or empty Start fragment. They are separate from `Register.server.requestContext`, which describes context supplied by the host.

### Preserve requirements in published declarations

Consumers must reach the augmentation through the package's declaration exports. Keep it in a `.ts` source file, preserve the framework registry re-export above, and add a type-only re-export to the module's root route:

```tsx title="packages/catalog/src/routes/__root.tsx"
import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'
export type {} from '../requirements'

export const Route = createModuleRoot()({
  component: () => <Outlet />,
})
```

The emitted route contract reaches the root declaration, which reaches `requirements.d.ts`. Both re-exports are erased from JavaScript. A standalone `.d.ts` that is never referenced by an exported declaration is insufficient; ordinary declaration emission does not copy arbitrary input declaration files. An unused empty type import may also disappear during emission.

Verify the published package from a consumer that has only its declarations, with `skipLibCheck: false`. Requirements can also be authored in a shared package, provided the module's public declaration graph retains the augmentation and its framework registry reference.

## Author middleware and server functions

The generated middleware factory knows the module's requirements without reading the inferred type of its Start fragment:

```ts title="packages/catalog/src/api.ts"
import { createMiddleware, createServerFn } from './routeScope.gen'

const pricing = createMiddleware({ type: 'function' }).server(
  ({ context, next }) =>
    next({
      context: {
        currency: context.permissions.includes('europe') ? 'EUR' : 'USD',
      },
    }),
)

export const getProduct = createServerFn()
  .middleware([pricing])
  .validator((id: string) => id)
  .handler(({ data, context }) => ({
    id: data,
    shopper: context.user.id,
    currency: context.currency,
  }))
```

Middleware attached to a server function runs for that function. This is the appropriate place for feature-specific authorization or pricing logic. Global contributions run for the whole application.

Context validation follows middleware execution order, including nested middleware and replacement of existing context properties. A later incompatible replacement cannot be hidden by an earlier valid provider. The checks also apply when module middleware is consumed from an application or another module. Use concrete compatible context types; an `any` value cannot establish the required contract.

## Contribute application-wide behavior

A Start fragment contains executable contributions: `serializationAdapters`, `requestMiddleware` and `functionMiddleware`. Create one only when the module contributes such behavior. Put it in `start.ts` or `start.tsx` next to the configured generated route tree, and export it as `start`:

```ts title="packages/catalog/src/start.ts"
import { createStartModule } from './routeScope.gen'
import { moneyAdapter } from './money'

export const start = createStartModule(() => ({
  serializationAdapters: [moneyAdapter],
}))
```

A fragment cannot set application-wide options such as `defaultSsr` or `serverFns`. Its factory is independent of the application's Start instance. Loader and `beforeLoad` results, as well as server-function results, are checked for serialization with the appropriate adapters.

| Need                                                       | Author it with                                        |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| Context supplied by the host                               | `StartModuleRequirements` augmentation                |
| Logic used by particular server functions                  | Generated `createMiddleware` and `.middleware([...])` |
| Middleware or adapters installed for the whole application | `createStartModule(() => ({ ... }))`                  |

Shared authentication normally belongs in the host. Modules can require the resulting user context instead of contributing duplicate authentication middleware. Runtime deduplication recognizes the same middleware or adapter object; two separately created objects still both run.

Run `tsr generate` after adding or removing the fragment file. During development, configure Nx or another workspace task runner to rerun generation and dependent builds/checks for these changes. Include the fragment beside the configured route tree in the task inputs, including when that directory is outside `src`.

## Install modules in an application

Choose mount paths in the application configuration:

```ts title="apps/web/vite.config.ts"
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [
    tanstackStart({
      router: {
        routeModules: {
          includes: [{ module: '@acme/catalog', at: '/shop' }],
        },
      },
    }),
  ],
})
```

For modules with executable fragments, install the generated list in the application's Start instance:

```ts title="apps/web/src/start.ts"
import { createMiddleware, createStart } from '@tanstack/react-start'
import { startModules } from './startModules.gen'

const user = createMiddleware().server(({ next }) =>
  next({ context: { user: { id: 'ada' } } }),
)
const permissions = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { permissions: ['europe'] } }),
)

export const startInstance = createStart(() => ({
  extends: startModules,
  requestMiddleware: [user],
  functionMiddleware: [permissions],
}))
```

The generated type check validates the requirements of every installed module, including modules without a fragment. A requirements-only module needs no `extends` entry. Executable contributions still need installation through `extends: startModules`.

Validation needs concrete tuples and rejects a required entry or provider that may be absent. It checks request and function lists independently: conditionally supplying the same field through one list or the other may work at runtime but cannot establish the contract. Keep a common provider in an unconditional tuple entry when the requirement depends on that relationship.

Prefer named context properties for module requirements. A `Record<string, User>` does not establish that a required `user` property exists. Optional properties and index signatures may leave earlier context values untouched. The validator keeps those possibilities; repairing one named property may not prove a broad index contract again.

Application entries run first, followed by contributed entries. Entries are deduplicated by object identity, preserving their first position. If an application explicitly places a contributed middleware earlier in its own list, that is its execution position. Compatible host context providers can satisfy a requirement; they need not come from a particular authentication package. Subsequent middleware must preserve the context promised to each consumer.

Without an application `start.ts`, requirements-only modules are checked against the default Start configuration, including registered `handler.fetch` context. Create an entry exporting `startInstance` when the application needs its own middleware or must install executable fragments. Executable fragments require that entry and `extends: startModules`; mounting them into an application without the framework's Start package is rejected.

## Build and publish modules

Use the [ordinary package build workflow](../../../../router/routing/route-modules.md#building-and-watching): route generation, the package's TypeScript declaration build, and consumer source checks in dependency order. Nx, Turborepo or another task runner owns scheduling, caching and rerunning tasks when sources, package metadata or provider artifacts change. Router does not run TypeScript, publish declaration health records or detect whether a task runner restored stale declarations.

Publish the generated runtime entry, its referenced route sources or compiled JavaScript, the generated client tree views, the topology manifest and the complete reachable declaration output. Include all of them in cached task outputs when caching is enabled. A package build must remove obsolete declaration output and verify its export paths and dependencies.

## Client and server builds

Vite and Rsbuild use the same rules across React, Solid and Vue:

- Module sources participate in normal code splitting, Start compilation and [import protection](./import-protection.md).
- Client trees remove a route whose only recorded option is `server` when all of its children are also removed. Mixed UI/server routes and ancestors needed by surviving children remain. Server trees preserve the endpoints.
- Providers generate their own client tree views. The host bundler selects those views for client imports; it does not write files into provider packages or filter routes in the browser.
- Automatic prerender discovery includes eligible mounted module pages, including nested and named installations. Dynamic installed URLs and handler-only endpoints are excluded. Explicit pages, disabling discovery, filters and basepaths continue to apply.

> [!NOTE]
> In a module installed several times, loader and `beforeLoad` redirects resolve from the matched route. Redirects returned through a component's `useServerFn` do not yet capture its nearest installation. Return data and navigate with the module's `useNavigate` in that case.
