declare module '#tanstack-router-entry' {
  import type { RouterEntry } from '@tanstack/start-client-core'

  export const getRouter: RouterEntry['getRouter']
}

declare module '#tanstack-start-entry' {
  import type { StartEntry } from '@tanstack/start-client-core'

  export const startInstance: StartEntry['startInstance']
}

declare module '#tanstack-start-plugin-adapters' {
  import type { AnySerializationAdapter } from '@tanstack/router-core'

  export const hasPluginAdapters: boolean
  export const pluginSerializationAdapters: Array<AnySerializationAdapter>
}

declare module 'tanstack-start-manifest:v' {
  import type { ServerManifest } from '@tanstack/router-core'

  export const tsrStartManifest: () => ServerManifest
  export const hasServerRoutes: boolean
}

declare module 'tanstack-start-route-tree:v' {
  import type { AnyRoute } from '@tanstack/router-core'

  export const routeTree: AnyRoute | undefined
}

declare module '#tanstack-start-server-fn-resolver' {
  export type ServerFnLookupAccess = { origin: 'client' } | { origin: 'server' }

  export type ServerFn = ((...args: Array<any>) => Promise<any>) & {
    method?: 'GET' | 'POST'
  }
  export function getServerFnById(
    id: string,
    access: ServerFnLookupAccess,
  ): Promise<ServerFn>
}
