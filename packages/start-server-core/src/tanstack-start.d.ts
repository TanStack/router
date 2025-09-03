declare module 'tanstack-start-manifest:v' {
  import type { Manifest } from '@tanstack/router-core'

  export const tsrStartManifest: () => Manifest & { clientEntry: string }
}

declare module 'tanstack-start-route-tree:v' {
  import type { AnyServerRouteWithTypes } from '@tanstack/start-server-core'
  import type { AnyRoute } from '@tanstack/router-core'

  export const routeTree: AnyRoute | undefined
  export const serverRouteTree: AnyServerRouteWithTypes | undefined
}

declare module 'tanstack-start-server-fn-manifest:v' {
  const serverFnManifest: Record<
    string,
    {
      importer: () => Promise<
        Record<string, (...args: Array<any>) => Promise<any>> | undefined
      >
      functionName: string
    }
  >

  export default serverFnManifest
}
