import invariant from 'tiny-invariant'

export const serverFnReturnTypeHeader = 'server-fn-return-type'
export const serverFnPayloadTypeHeader = 'server-fn-payload-type'

export interface JsonResponse<TData> extends Response {
  json(): Promise<TData>
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
    ? {
        (
          payload?: TPayload,
          opts?: FetcherOptions,
        ): Promise<JsonResponseOrPayload<TResponse>>
      }
    : {
        (
          payload: TPayload,
          opts?: FetcherOptions,
        ): Promise<JsonResponseOrPayload<TResponse>>
      }) & {
    url: string
  }

export type JsonResponseOrPayload<TResponse> =
  TResponse extends JsonResponse<infer TData> ? TData : TResponse

export function createServerFn<
  TPayload extends any = undefined,
  TResponse = unknown,
>(
  method: 'GET' | 'POST',
  fn: FetchFn<TPayload, TResponse>,
): Fetcher<TPayload, TResponse> {
  // Cast the compiled function that will be injected by vinxi
  const compiledFn = fn as unknown as CompiledFetcherFn<TPayload, TResponse>

  invariant(
    compiledFn.url,
    `createServerFn must be called with a function that is marked with the 'use server' pragma.`,
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

export function json<TData>(
  payload: TData,
  opts?: {
    status?: number
    statusText?: string
    headers?: HeadersInit
  },
): JsonResponse<TData> {
  return new Response(JSON.stringify(payload), {
    status: opts?.status || 200,
    statusText: opts?.statusText || opts?.status === 200 ? 'OK' : 'Error',
    headers: {
      'Content-Type': 'application/json',
      [serverFnReturnTypeHeader]: 'json',
      ...opts?.headers,
    },
  })
}
