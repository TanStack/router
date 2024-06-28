import invariant from 'tiny-invariant'

export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}

export type FetcherOptionsBase = {
  method?: 'GET' | 'POST'
}

export type FetcherOptions = FetcherOptionsBase & {
  requestInit?: RequestInit
}

export type FetchFnCtx = {
  method: 'GET' | 'POST'
  request: Request
}

export type FetchFn<TPayload, TResponse> = {
  (payload: TPayload, ctx: FetchFnCtx): Promise<TResponse> | TResponse
  url?: string
}

export type CompiledFetcherFnOptions<TPayload> = {
  method: 'GET' | 'POST'
  payload: TPayload | undefined
  requestInit?: RequestInit
}

export type CompiledFetcherFn<TPayload, TResponse> = {
  (opts: CompiledFetcherFnOptions<TPayload>): Promise<TResponse>
  url: string
}

type IsPayloadOptional<T> = [T] extends [undefined] ? true : false

export type Fetcher<TPayload, TResponse> =
  (IsPayloadOptional<TPayload> extends true
    ? (
        payload?: TPayload,
        opts?: FetcherOptions,
      ) => Promise<FetcherPayload<TResponse>>
    : (
        payload: TPayload,
        opts?: FetcherOptions,
      ) => Promise<FetcherPayload<TResponse>>) & {
    url: string
  }

export type FetcherPayload<TResponse> = WrapRSCs<
  TResponse extends JsonResponse<infer TData> ? TData : TResponse
>

type WrapRSCs<T> = T extends JSX.Element
  ? ReadableStream
  : T extends Record<string, any>
    ? {
        [K in keyof T]: WrapRSCs<T[K]>
      }
    : T extends Array<infer U>
      ? Array<WrapRSCs<U>>
      : T

export type RscStream<T> = {
  __cacheState: T
}

export function createServerFn<
  TMethod extends 'GET' | 'POST',
  TPayload = undefined,
  TResponse = unknown,
>(
  method: TMethod,
  fn: FetchFn<TPayload, TResponse>,
): Fetcher<TPayload, TResponse> {
  // Cast the compiled function that will be injected by vinxi
  const compiledFn = fn as unknown as CompiledFetcherFn<TPayload, TResponse>

  invariant(
    compiledFn.url,
    `createServerFn must be called with a function that is marked with the 'use server' pragma. Are you using the @tanstack/router-plugin/vite ?`,
  )

  return Object.assign(
    async (payload: TPayload, opts?: FetcherOptions) => {
      return compiledFn({
        method,
        payload: payload || undefined,
        requestInit: opts?.requestInit,
      })
    },
    {
      url: fn.url!,
    },
  ) as Fetcher<TPayload, TResponse>
}
