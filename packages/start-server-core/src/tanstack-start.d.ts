declare module 'tanstack-start-manifest:v' {
  import type { Manifest } from '@tanstack/router-core'

  export const tsrStartManifest: () => Manifest & { clientEntry: string }
}

declare module 'tanstack-start-route-tree:v' {
  import type { AnyRoute } from '@tanstack/router-core'

  export const routeTree: AnyRoute | undefined
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

declare module 'tanstack-start-injected-head-scripts:v' {
  export const injectedHeadScripts: string | undefined
}
