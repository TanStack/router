export {
  configSchema,
  getConfig,
  resolveConfigPath,
  baseConfigSchema,
} from './config'
export type { Config, BaseConfig } from './config'

export { Generator } from './generator'
export type { FileEventType, FileEvent, GeneratorEvent } from './generator'

export type { GeneratorPlugin } from './plugin/types'

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

export type { TransformContext, TransformOptions } from './transform/types'

export {
  getManifestPath as getRouteModuleManifestPath,
  readManifest as readRouteModuleManifest,
} from './route-module/manifest'
export type {
  ManifestInstalledModule,
  ManifestRoute,
  RouteModuleManifest,
} from './route-module/manifest'
export {
  getInstalledRouteModuleDirectories,
  resolveRouteModuleContext,
} from './route-module/context'
export type {
  ResolvedMount,
  RouteModuleContext,
  ScopeModule,
} from './route-module/context'
export type {
  ModuleDeclaration,
  RouteModuleDeclaration,
  RouteModulesOption,
} from './route-module/declaration'

export { pruneServerOnlySubtrees } from './pruneServerOnlySubtrees'
