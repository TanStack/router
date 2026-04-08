export type { TanStackStartInputConfig } from './schema'
export type { TanStackStartCoreOptions } from './types'
export type {
  TanStackStartVitePluginCoreOptions,
  ViteRscForwardSsrResolverStrategy,
} from './vite/types'
export type { TanStackStartViteInputConfig } from './vite/schema'
export { START_ENVIRONMENT_NAMES, VITE_ENVIRONMENT_NAMES } from './constants'
export { createVirtualModule } from './vite/createVirtualModule'
export { tanStackStartVite } from './vite/plugin'

export { RSBUILD_ENVIRONMENT_NAMES } from './rsbuild/planning'
export type { TanStackStartRsbuildPluginCoreOptions } from './rsbuild/types'
export type { TanStackStartRsbuildInputConfig } from './rsbuild/schema'
export { tanStackStartRsbuild } from './rsbuild/plugin'
