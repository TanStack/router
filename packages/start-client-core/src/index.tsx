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
} from './createMiddleware'
export type {
  CompiledFetcherFnOptions,
  CompiledFetcherFn,
  Fetcher,
  RscStream,
  FetcherData,
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
} from './constants'

export type * from './serverRoute'

export type * from './startEntry'

export { createStart } from './createStart'
export type { AnyStartInstance, AnyStartInstanceOptions } from './createStart'
export type { Register } from '@tanstack/router-core'

export { getRouterInstance } from './getRouterInstance'
export { getDefaultSerovalPlugins } from './getDefaultSerovalPlugins'
export { getGlobalStartContext } from './getGlobalStartContext'
