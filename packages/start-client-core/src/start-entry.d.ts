declare module '#tanstack-start-entry' {
  import type { StartEntry } from '@tanstack/start-client-core'

  export const startInstance: StartEntry['startInstance']
}

declare module '#tanstack-router-entry' {
  import type { RouterEntry } from '@tanstack/start-client-core'

  export const getRouter: RouterEntry['getRouter']
}
