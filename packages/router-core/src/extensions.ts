// The interfaces that framework packages augment:
//
//   declare module '@tanstack/router-core/extensions' {
//     interface UpdatableRouteOptionsExtensions { component?: RouteComponent }
//   }
//
// Augment this entry, never `@tanstack/router-core` itself. An augmentation
// gives its module a name that TypeScript prefers when it writes types into
// declaration files. Augmenting the main entry would make a route module's
// `.d.ts` say `import("@tanstack/router-core").Route` instead of
// `import("@tanstack/react-router").RouteCore`, although the module only
// depends on `@tanstack/react-router`. Under pnpm the module's consumers then
// cannot resolve that import, and with `skipLibCheck` the type silently
// becomes `any`.
export type { LazyRoute } from './fileRoute'
export type { RouteMatchExtensions } from './Matches'
export type {
  BeforeLoadContextOptions,
  ErrorBoundaryTypes,
  FilebaseRouteOptionsInterface,
  LoaderFnContext,
  RootRouteOptionsExtensions,
  RouteExtensions,
  RouteTypes,
  UpdatableRouteOptionsExtensions,
} from './route'
export type { RouterOptionsExtensions } from './router'
export type { RouterReadableStore, RouterStores } from './stores'
export type {
  SerializableExtensions,
  SerializerExtensions,
} from './ssr/serializer/transformer'
