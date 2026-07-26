export {
  configSchema,
  getConfig,
  resolveConfigPath,
  baseConfigSchema,
} from './config'
export type { Config, BaseConfig } from './config'

export { Generator } from './generator'
export type { FileEventType, FileEvent, GeneratorEvent } from './generator'

export type {
  FormatRouteOptions,
  GeneratorPlugin,
  TransformRouteSourceOptions,
} from './plugin/types'

export {
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
  checkRouteFullPathUniqueness,
  inferFullPath,
} from './utils'

export type {
  RouteNode,
  GetRouteNodesResult,
  GetRoutesByFileMapResult,
  GetRoutesByFileMapResultValue,
  ImportDeclaration,
  ImportSpecifier,
  HandleNodeAccumulator,
} from './types'

export { getRouteNodes as physicalGetRouteNodes } from './filesystem/physical/getRouteNodes'
export { getRouteNodes as virtualGetRouteNodes } from './filesystem/virtual/getRouteNodes'

export { rootPathId } from './filesystem/physical/rootPathId'

export type {
  TransformContext,
  TransformOptions,
  TransformResult,
} from './transform/types'
