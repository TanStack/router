import invariant from 'tiny-invariant'

export const XTSROrigin = 'x-tsr-origin'

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
  (payload: TPayload, ctx: FetchFnCtx): TResponse
  url?: string
}

// export type AnyFetchFn = FetchFn<any, any>

// export type FetchFnReturn<T extends AnyFetchFn> =
// Awaited<ReturnType<T>> extends JsonResponse<infer R> ? R : ReturnType<T>

// export type FetcherFn<T extends AnyFetchFn> = Parameters<T>[0] extends undefined
//   ? (
//       payload?: Parameters<T>['0'],
//       opts?: FetchFnCtx,
//     ) => Promise<Awaited<FetchFnReturn<T>>>
//   : (
//       payload: Parameters<T>['0'],
//       opts?: FetchFnCtx,
//     ) => Promise<Awaited<FetchFnReturn<T>>>

// export type FetcherMethods<T extends AnyFetchFn> = {
//   url: string
//   fetch: (
//     init: RequestInit,
//     opts?: FetcherOptions,
//   ) => Promise<Awaited<FetchFnReturn<T>>>
// }

// export type Fetcher<T extends AnyFetchFn> = FetcherFn<T> & FetcherMethods<T>

export type CompiledFetcherFnOptions<TPayload> = {
  method: 'GET' | 'POST'
  type: 'request' | 'payload'
  payload: TPayload
  requestInit?: RequestInit
}

export type CompiledFetcherFn<TPayload, TResponse> = {
  (opts: CompiledFetcherFnOptions<TPayload>): Promise<TResponse>
  url: string
}

export type Fetcher<TPayload, TResponse> = (TPayload extends undefined
  ? {
      (payload?: TPayload, opts?: FetcherOptions): Promise<TResponse>
    }
  : {
      (payload: TPayload, opts?: FetcherOptions): Promise<TResponse>
    }) & {
  url: string
}

export function createServerFn<TPayload, TResponse>(
  method: 'GET' | 'POST',
  fn: FetchFn<TPayload, TResponse>,
): Fetcher<TPayload, TResponse> {
  // Cast the compiled function that will be injected by vinxi
  const compiledFn = fn as unknown as CompiledFetcherFn<TPayload, TResponse>

  console.log(
    compiledFn,
    compiledFn.toString(),
    JSON.stringify(compiledFn, null, 2),
  )

  invariant(
    compiledFn.url,
    `createServerFn must be called with a function that is marked with the 'use server' pragma.`,
  )

  return Object.assign(
    async (payload: TPayload, opts?: FetcherOptions) => {
      return compiledFn({
        method,
        type: payload instanceof Request ? 'request' : 'payload',
        payload,
        requestInit: opts?.requestInit,
      })
    },
    {
      url: fn.url!,
    },
  ) as Fetcher<TPayload, TResponse>
}
