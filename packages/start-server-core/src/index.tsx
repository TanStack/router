export { createStartHandler } from './createStartHandler'
export type { CreateStartHandlerOptions } from './createStartHandler'

// Server-function dispatch primitive. Exposed so framework-specific
// handlers (e.g. `@tanstack/remix-start`) can wire `${serverFnBase}/<id>`
// requests through the same RPC runtime without re-implementing it.
export { handleServerAction } from './server-functions-handler'

export type {
  TransformAssets,
  TransformAssetsFn,
  TransformAssetsContext,
  TransformAssetsOptions,
  TransformAssetsObjectShorthand,
  TransformAssetsCrossOriginConfig,
  TransformAssetResult,
  TransformAssetUrls,
  TransformAssetUrlsFn,
  TransformAssetUrlsContext,
  TransformAssetUrlsOptions,
  AssetUrlType,
  TransformAssetKind,
} from './transformAssetUrls'

export {
  attachRouterServerSsrUtils,
  createRequestHandler,
  defineHandlerCallback,
  transformReadableStreamWithRouter,
  transformPipeableStreamWithRouter,
} from '@tanstack/router-core/ssr/server'
export type { HandlerCallback } from '@tanstack/router-core/ssr/server'

export * from './request-response'

export * from './virtual-modules'

export { HEADERS } from './constants'

export type { RequestHandler, RequestOptions } from './request-handler'

export type { SessionConfig } from './session'

export type {
  EarlyHint,
  EarlyHintsEvent,
  EarlyHintsPhase,
  OnEarlyHints,
  ResponseLinkHeaderEntry,
  ResponseLinkHeaderFilter,
  ResponseLinkHeaderOptions,
} from './early-hints'
