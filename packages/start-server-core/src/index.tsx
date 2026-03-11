export { createStartHandler } from './createStartHandler'
export type { CreateStartHandlerOptions } from './createStartHandler'

export type {
  TransformAssetUrls,
  TransformAssetUrlsFn,
  TransformAssetUrlsContext,
  TransformAssetUrlsOptions,
  AssetUrlType,
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
