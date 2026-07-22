export type {
  TanStackStartVitePluginCoreOptions,
  ViteRscForwardSsrResolverStrategy,
} from './types'
export type { TanStackStartViteInputConfig } from './schema'
export type {
  StartCompilerImportTransform,
  StartCompilerTransformCandidate,
  StartCompilerTransformContext,
} from '../types'
export { START_ENVIRONMENT_NAMES, VITE_ENVIRONMENT_NAMES } from '../constants'
export { createVirtualModule } from './createVirtualModule'
export {
  normalizeServerFnBase,
  startClientCompilerVite,
} from './client-compiler-plugin'
export type { StartClientCompilerViteOptions } from './client-compiler-plugin'
export { tanStackStartVite } from './plugin'
