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
  ResolveAllServerContext,
  RouteVerb,
  RouteMethodHandlerFn,
  MergeMethodMiddlewares,
  AssignAllMethodContext,
  RouteVerbs,
  CreateMethodFn,
  CreateMethodFnOpts,
  RouteMethodBuilderResult,
  RouteMethodHandler,
  RouteMethodHandlerCtx,
  RouteMethodWithMiddleware,
  RouteServerOptions,
  RouteMethodBuilderOptions,
  RouteMethodsOrOptionsRecord,
  RouteMethodsRecord,
} from './serverRoute'

export * from './virtual-modules'

export { HEADERS } from './constants'

export { createServerRpc } from './createServerRpc'
