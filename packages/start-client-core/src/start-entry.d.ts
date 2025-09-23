declare module '#tanstack-start-entry' {
  import type { StartEntry } from '@tanstack/start-client-core'

  export const getRouter: StartEntry['getRouter']
  export const getStart: StartEntry['getStart']
}
