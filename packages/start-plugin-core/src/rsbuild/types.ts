import type { TanStackStartCoreOptions } from '../types'

export type TanStackStartRsbuildPluginCoreOptions = TanStackStartCoreOptions & {
  providerEnvironmentName: string
  ssrIsProvider: boolean
  rsc?: boolean | undefined
}
