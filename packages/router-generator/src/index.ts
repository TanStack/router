export {
  configSchema,
  getConfig,
  resolveConfigPath,
  baseConfigSchema,
} from './config'
export type { Config, BaseConfig } from './config'

export { generator } from './generator'

export {
  logging,
  capitalize,
  cleanPath,
  trimPathLeft,
  removeLeadingSlash,
  removeTrailingSlash,
  determineInitialRoutePath,
  replaceBackslash,
  routePathToVariable,
  removeUnderscores,
  resetRegex,
  multiSortBy,
  writeIfDifferent,
  format,
  removeExt,
} from './utils'

export type { RouteNode, GetRouteNodesResult } from './types'

export { getRouteNodes as physicalGetRouteNodes } from './filesystem/physical/getRouteNodes'
export { getRouteNodes as virtualGetRouteNodes } from './filesystem/virtual/getRouteNodes'

export { rootPathId } from './filesystem/physical/rootPathId'
