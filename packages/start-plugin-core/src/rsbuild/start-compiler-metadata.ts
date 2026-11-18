import type { ServerFn } from '../start-compiler/types'

export const SERVER_FN_BUILD_INFO_FIELD = 'tanstack.start.serverFns'

export type ServerFnBuildInfo = {
  version: 1
  serverFnsById: Record<string, ServerFn>
}
