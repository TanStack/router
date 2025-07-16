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

export * from './h3'

export {
  createServerRoute,
  createServerFileRoute,
  createServerRootRoute,
} from './serverRoute'
export type {
  CreateServerFileRoute,
  ServerFileRoutesByPath,
  ServerRouteOptions,
  ServerRouteManifest,
  ServerRouteAddFileChildrenFn,
  ServerRouteMethodBuilderOptions,
  AnyServerRouteWithTypes,
  ServerRouteWithTypes,
  ServerRouteTypes,
  ResolveAllServerContext,
  AnyServerRoute,
  ServerRoute,
  ServerRouteMiddleware,
  ServerRouteAfterMiddleware,
  ServerRouteMethods,
  ServerRouteMethodsOptions,
  ServerRouteMethodsRecord,
  ServerRouteMethodRecordValue,
  ServerRouteVerb,
  ServerRouteMethodHandlerFn,
  ServerRouteMethodHandlerCtx,
  MergeMethodMiddlewares,
  AssignAllMethodContext,
  AnyRouteMethodsBuilder,
  ServerRouteMethodBuilder,
  ServerRouteMethodBuilderWithTypes,
  ServerRouteMethodBuilderTypes,
  ServerRouteMethodBuilderMiddleware,
  ServerRouteMethodBuilderAfterMiddleware,
  ServerRouteMethodBuilderHandler,
  ServerRouteMethodBuilderAfterHandler,
  ServerRouteMethod,
  ServerRouteAfterMethods,
} from './serverRoute'

export * from './virtual-modules'
