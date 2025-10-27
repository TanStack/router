declare module 'tanstack-start-manifest:v' {
  import type { Manifest } from '@tanstack/router-core'

  export const tsrStartManifest: () => Manifest & { clientEntry: string }
}

declare module 'tanstack-start-route-tree:v' {
  import type { AnyRoute } from '@tanstack/router-core'

  export const routeTree: AnyRoute | undefined
}

declare module '#tanstack-start-server-fn-manifest' {
  type ServerFn = (...args: Array<any>) => Promise<any>
  export function getServerFnById(id: string): Promise<ServerFn>
}

declare module 'tanstack-start-injected-head-scripts:v' {
  export const injectedHeadScripts: string | undefined
}
