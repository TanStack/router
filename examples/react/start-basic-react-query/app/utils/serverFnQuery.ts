import {
  DataTag,
  queryOptions,
  UnusedSkipTokenOptions,
  UseQueryOptions,
} from '@tanstack/react-query'
import { Fetcher, FetcherParameters, FetcherResult } from '@tanstack/start'

export type AnyFetcher = Fetcher<any, any, any>

export type ServerFnQueryData<
  TMiddlewares,
  TResponse,
  TFullResponse extends boolean,
> = Awaited<FetcherResult<TMiddlewares, TResponse, TFullResponse>>

export type ServerFnQueryOptions<
  TMiddlewares,
  TResponse,
  TFullResponse extends boolean,
> = Omit<
  UseQueryOptions<
    ServerFnQueryData<TMiddlewares, TResponse, TFullResponse>,
    Error,
    ServerFnQueryData<TMiddlewares, TResponse, TFullResponse>,
    [string, ServerFnQueryData<TMiddlewares, TResponse, TFullResponse>]
  >,
  'queryKey' | 'queryFn'
>

export type ServerFnQueryOptionsResult<
  TMiddlewares,
  TResponse,
  TFullResponse extends boolean,
> = ServerFnQueryOptions<TMiddlewares, TResponse, TFullResponse> & {
  queryKey: DataTag<
    [string, ServerFnQueryData<TMiddlewares, TResponse, TFullResponse>],
    ServerFnQueryData<TMiddlewares, TResponse, TFullResponse>,
    Error
  >
}

export type ServerFnQueryParameters<
  TMiddlewares,
  TValidator,
  TResponse,
  TFullResponse extends boolean,
  TParams = FetcherParameters<TMiddlewares, TValidator, TFullResponse>,
> = {
  [K in keyof TParams]: TParams[K] &
    ServerFnQueryOptions<TMiddlewares, TResponse, TFullResponse>
}

export interface ServerFnQuery<TMiddlewares, TValidator, TResponse> {
  queryOptions: <TFullResponse extends boolean>(
    ...args: ServerFnQueryParameters<
      TMiddlewares,
      TValidator,
      TResponse,
      TFullResponse
    >
  ) => ServerFnQueryOptionsResult<TMiddlewares, TResponse, TFullResponse>
}

export const serverFnQuery = <TMiddlewares, TValidator, TResponse>(
  fetcher: Fetcher<TMiddlewares, TValidator, TResponse>,
): ServerFnQuery<TMiddlewares, TValidator, TResponse> => {
  if (!('functionId' in fetcher) || typeof fetcher.functionId !== 'string') {
    throw new Error()
  }

  return {
    queryOptions: (options) => {
      const queryKey = [fetcher.functionId]

      if (options?.data != null) {
        queryKey.push(options.data)
      }

      return queryOptions({
        ...options,
        queryKey: queryKey as any,
        queryFn: fetcher as any,
      })
    },
  } as ServerFnQuery<TMiddlewares, TValidator, TResponse>
}
