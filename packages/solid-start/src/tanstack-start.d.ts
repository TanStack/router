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

declare module '#tanstack-router-entry' {
  import type { AnyRouter } from '@tanstack/solid-router'

  export function getRouter(): AnyRouter | Promise<AnyRouter>
}

declare module '#tanstack-start-entry' {
  import type { AnyStartInstance } from '@tanstack/start-client-core'

  export const startInstance: AnyStartInstance | undefined
}

declare module '#tanstack-start-plugin-adapters' {
  import type { AnySerializationAdapter } from '@tanstack/solid-router'

  export const hasPluginAdapters: boolean
  export const pluginSerializationAdapters: Array<AnySerializationAdapter>
}
