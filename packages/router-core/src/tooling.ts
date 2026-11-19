/**
 * The helpers build tooling (the route generator, the Start plugin) needs.
 * It still loads part of the router runtime: the path helpers import
 * `utils`, whose `isServer` import, under Node's conditions
 * (`isServer/server`), re-exports `loadServerRoute` and what it imports.
 */
export { rootRouteId } from './root'
export { cleanPath, joinPaths, trimPathLeft, trimPathRight } from './path'
export {
  getStylesheetHref,
  resolveManifestAssetLink,
  resolveManifestCssLink,
} from './manifest'
