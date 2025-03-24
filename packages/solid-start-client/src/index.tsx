/// <reference types="vinxi/types/client" />
export {
  mergeHeaders,
  startSerializer,
  createIsomorphicFn,
  createServerFn,
  createMiddleware,
  registerGlobalMiddleware,
  globalMiddleware,
  serverOnly,
  clientOnly,
  createServerFileRoute,
  json,
} from '@tanstack/start-client-core'
export {
  type DehydratedRouter,
  type ClientExtractedBaseEntry,
  type StartSsrGlobal,
  type ClientExtractedEntry,
  type SsrMatch,
  type ClientExtractedPromise,
  type ClientExtractedStream,
  type ResolvePromiseState,
} from '@tanstack/start-client-core'
export {
  type IsomorphicFn,
  type ServerOnlyFn,
  type ClientOnlyFn,
  type IsomorphicFnBase,
} from '@tanstack/start-client-core'
export {
  type ServerFn as FetchFn,
  type ServerFnCtx as FetchFnCtx,
  type CompiledFetcherFnOptions,
  type CompiledFetcherFn,
  type Fetcher,
  type RscStream,
  type FetcherData,
  type FetcherBaseOptions,
  type ServerFn,
  type ServerFnCtx,
  type ServerFnResponseType,
} from '@tanstack/start-client-core'
export { type JsonResponse } from '@tanstack/start-client-core'
export {
  type IntersectAllValidatorInputs,
  type IntersectAllValidatorOutputs,
  type MiddlewareServerFn,
  type AnyMiddleware,
  type MiddlewareOptions,
  type MiddlewareWithTypes,
  type MiddlewareValidator,
  type MiddlewareServer,
  type MiddlewareAfterClient,
  type MiddlewareAfterServer,
  type Middleware,
  type MiddlewareClientFnOptions,
  type MiddlewareClientFnResult,
  type MiddlewareClientNextFn,
  type ClientResultWithContext,
  type AssignAllClientContextBeforeNext,
  type AssignAllMiddleware,
  type AssignAllServerContext,
  type MiddlewareAfterValidator,
  type MiddlewareClientFn,
  type MiddlewareServerFnResult,
  type MiddlewareClient,
  type MiddlewareServerFnOptions,
  type MiddlewareServerNextFn,
  type ServerResultWithContext,
} from '@tanstack/start-client-core'
export { Meta } from './Meta'
export { Scripts } from './Scripts'
export { StartClient } from './StartClient'
export { renderRsc } from './renderRSC'
export { useServerFn } from './useServerFn'
