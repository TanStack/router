declare module 'tanstack-start-manifest:v' {
  import type { Manifest } from '@tanstack/router-core'

  export const tsrStartManifest: () => Manifest
}

declare module 'tanstack-start-route-tree:v' {
  import type { AnyServerRoute } from '@tanstack/start-server-core'
  import type { AnyRoute } from '@tanstack/router-core'

  export const routeTree: AnyRoute | undefined
  export const serverRouteTree: AnyServerRoute | undefined
}

declare module 'tanstack-start-server-fn-manifest:v' {
  import type { DirectiveFn } from '@tanstack/directive-functions-plugin'

  const serverFnManifest: Record<string, DirectiveFn>
  export default serverFnManifest
}
