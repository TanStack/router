export type {
  DehydratedRouter,
  ClientExtractedBaseEntry,
  TsrSsrGlobal as StartSsrGlobal,
  ClientExtractedEntry,
  JsonResponse,
  SsrMatch,
  ClientExtractedPromise,
  ClientExtractedStream,
  ResolvePromiseState,
} from '@tanstack/router-core/ssr/client'

export {
  hydrate,
  json,
  mergeHeaders,
  tsrSerializer as startSerializer,
} from '@tanstack/router-core/ssr/client'

export {
  createIsomorphicFn,
  type IsomorphicFn,
  type ServerOnlyFn,
  type ClientOnlyFn,
  type IsomorphicFnBase,
} from './createIsomorphicFn'
export { serverOnly, clientOnly } from './envOnly'
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
  type AssignAllServerContext,
  type FunctionMiddlewareAfterValidator,
  type FunctionMiddlewareClientFn,
  type FunctionMiddlewareServerFnResult,
  type FunctionMiddlewareClient,
  type FunctionMiddlewareServerFnOptions,
  type FunctionMiddlewareServerNextFn,
  type FunctionServerResultWithContext,
  type AnyRequestMiddleware,
} from './createMiddleware'
export {
  registerGlobalMiddleware,
  globalMiddleware,
} from './registerGlobalMiddleware'
export type {
  ServerFn as FetchFn,
  ServerFnCtx as FetchFnCtx,
  CompiledFetcherFnOptions,
  CompiledFetcherFn,
  Fetcher,
  RscStream,
  FetcherData,
  FetcherBaseOptions,
  ServerFn,
  ServerFnCtx,
  ServerFnResponseType,
  MiddlewareFn,
  ServerFnMiddlewareOptions,
  ServerFnMiddlewareResult,
  ServerFnBuilder,
  ServerFnType,
  ServerFnBaseOptions,
  NextFn,
  Method,
  StaticCachedResult,
  OptionalFetcher,
  RequiredFetcher,
} from './createServerFn'
export {
  applyMiddleware,
  execValidator,
  serverFnBaseToMiddleware,
  extractFormDataContext,
  flattenMiddlewares,
  serverFnStaticCache,
  executeMiddleware,
} from './createServerFn'
