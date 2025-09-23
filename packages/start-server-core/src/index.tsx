import './serverRoute'

export { createStartHandler } from './createStartHandler'
export type { CustomizeStartHandler } from './createStartHandler'

export {
  attachRouterServerSsrUtils,
  createRequestHandler,
  defineHandlerCallback,
  transformReadableStreamWithRouter,
  transformPipeableStreamWithRouter,
} from '@tanstack/router-core/ssr/server'
export type { HandlerCallback } from '@tanstack/router-core/ssr/server'

export { handleServerAction } from './server-functions-handler'

export * from './request-response'
export type {
  RouteMethodBuilderOptions,
  ResolveAllServerContext,
  RouteMethodsOptions,
  RouteMethodsRecord,
  RouteMethodRecordValue,
  RouteVerb,
  RouteMethodHandlerFn,
  RouteMethodHandlerCtx,
  MergeMethodMiddlewares,
  AssignAllMethodContext,
  AnyRouteMethodsBuilder,
  RouteMethodBuilder,
  RouteMethodBuilderWithTypes,
  RouteMethodBuilderTypes,
  RouteMethodBuilderMiddleware,
  RouteMethodBuilderAfterMiddleware,
  RouteMethodBuilderHandler,
  RouteMethodBuilderAfterHandler,
  RouteMethod,
} from './serverRoute'

export * from './virtual-modules'

export { HEADERS } from './constants'

export { createServerRpc } from './createServerRpc'
