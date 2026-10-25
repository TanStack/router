/**
 * The helpers build tooling (the route generator, the Start plugin) needs,
 * without the router runtime the root entry loads.
 */
export { rootRouteId } from './root'
export { cleanPath, joinPaths, trimPathLeft, trimPathRight } from './path'
export {
  getStylesheetHref,
  resolveManifestAssetLink,
  resolveManifestCssLink,
} from './manifest'
