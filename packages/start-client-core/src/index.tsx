export type {
  DehydratedRouter,
  JsonResponse,
} from '@tanstack/router-core/ssr/client'

export { hydrate, json, mergeHeaders } from '@tanstack/router-core/ssr/client'

export {
  createIsomorphicFn,
  type IsomorphicFn,
  type ServerOnlyFn,
  type ClientOnlyFn,
  type IsomorphicFnBase,
} from './createIsomorphicFn'
export { createServerOnlyFn, createClientOnlyFn } from './envOnly'
export { createServerFn } from './createServerFn'
export {
  createMiddleware,
  type IntersectAllValidatorInputs,
  type IntersectAllValidatorOutputs,
  type FunctionMiddlewareServerFn,
  type AnyFunctionMiddleware,
  type FunctionMiddlewareOptions,
  type FunctionMiddlewareWithTypes,
  type FunctionMiddlewareValidator,
  type FunctionMiddlewareServer,
  type FunctionMiddlewareAfterClient,
  type FunctionMiddlewareAfterServer,
  type FunctionMiddleware,
  type FunctionMiddlewareAfterMiddleware,
  type FunctionMiddlewareClientFnOptions,
  type FunctionMiddlewareClientFnResult,
  type FunctionMiddlewareClientNextFn,
  type FunctionClientResultWithContext,
  type AssignAllClientContextBeforeNext,
  type AssignAllMiddleware,
  type FunctionMiddlewareAfterValidator,
  type FunctionMiddlewareClientFn,
  type FunctionMiddlewareServerFnResult,
  type FunctionMiddlewareClient,
  type FunctionMiddlewareServerFnOptions,
  type FunctionMiddlewareServerNextFn,
  type FunctionServerResultWithContext,
  type AnyRequestMiddleware,
  type RequestMiddlewareOptions,
  type RequestMiddlewareWithTypes,
  type RequestMiddlewareServer,
  type RequestMiddlewareAfterServer,
  type RequestMiddleware,
  type RequestMiddlewareAfterMiddleware,
  type RequestServerFn,
  type RequestMiddlewareServerFnResult,
  type RequestServerOptions,
  type RequestServerNextFn,
  type RequestServerNextFnOptions,
  type RequestServerResult,
} from './createMiddleware'
export type {
  CompiledFetcherFnOptions,
  CompiledFetcherFn,
  Fetcher,
  RscStream,
  FetcherBaseOptions,
  ServerFn,
  ServerFnCtx,
  MiddlewareFn,
  ServerFnMiddlewareOptions,
  ServerFnMiddlewareResult,
  ServerFnBuilder,
  ServerFnBaseOptions,
  NextFn,
  Method,
  OptionalFetcher,
  RequiredFetcher,
} from './createServerFn'
export {
  applyMiddleware,
  execValidator,
  flattenMiddlewares,
  executeMiddleware,
} from './createServerFn'

export {
  TSS_FORMDATA_CONTEXT,
  TSS_SERVER_FUNCTION,
  X_TSS_SERIALIZED,
  X_TSS_RAW_RESPONSE,
} from './constants'

export type * from './serverRoute'

export type * from './startEntry'

export { createStart } from './createStart'
export type {
  AnyStartInstance,
  AnyStartInstanceOptions,
  StartInstance,
} from './createStart'
export type { Register } from '@tanstack/router-core'

export { getRouterInstance } from './getRouterInstance'
export { getDefaultSerovalPlugins } from './getDefaultSerovalPlugins'
export { getGlobalStartContext } from './getGlobalStartContext'
