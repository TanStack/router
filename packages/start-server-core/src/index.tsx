export {
  createStartHandler,
  transferResponseBodyOwnership,
} from './createStartHandler'
export type { CreateStartHandlerOptions } from './createStartHandler'

export type {
  TransformAssets,
  TransformAssetsFn,
  TransformAssetsContext,
  TransformAssetsOptions,
  TransformAssetsObjectShorthand,
  TransformAssetsCrossOriginConfig,
  TransformAssetResult,
  TransformAssetKind,
  CreateTransformAssetsContext,
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

export {
  createRobotsHandler,
  createSitemapHandler,
  createSitemapIndexHandler,
  renderRobots,
  renderSitemap,
  renderSitemapIndex,
  SITEMAP_MAX_URLS,
} from './metadata-routes'
export type {
  MetadataHandlerOptions,
  RenderMetadataOptions,
  Robots,
  RobotsRule,
  Sitemap,
  SitemapChangeFrequency,
  SitemapEntry,
  SitemapIndex,
  SitemapIndexEntry,
  SitemapVideo,
} from './metadata-routes'

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
