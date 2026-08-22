import type { AnyRouter } from '../router'

export type SsrResponse =
  | {
      response: Response
      serverSsrCleanup: 'none'
    }
  | {
      response: Response
      serverSsrCleanup: 'stream'
      dispose: (reason?: unknown) => Promise<void>
    }

export type HandlerCallbackResult = Response | SsrResponse

export function isSsrResponse(value: unknown): value is SsrResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'response' in value &&
    'serverSsrCleanup' in value
  )
}

export function normalizeSsrResponse(
  result: HandlerCallbackResult,
): SsrResponse {
  return isSsrResponse(result)
    ? result
    : { response: result, serverSsrCleanup: 'none' }
}

export function disposeSsrResponse(
  response: SsrResponse,
  reason?: unknown,
): Promise<void> {
  if (response.serverSsrCleanup !== 'stream') {
    return Promise.resolve()
  }
  try {
    return Promise.resolve(response.dispose(reason))
  } catch (error) {
    return Promise.reject(error)
  }
}

export function disposeSsrResponseDetached(
  result: HandlerCallbackResult,
  reason?: unknown,
  onError: (error: unknown) => void = console.error,
): void {
  const ssrResponse = normalizeSsrResponse(result)
  if (ssrResponse.serverSsrCleanup === 'stream') {
    void disposeSsrResponse(ssrResponse, reason).catch(onError)
    return
  }

  if (ssrResponse.response.body) {
    try {
      void ssrResponse.response.body.cancel(reason).catch(onError)
    } catch (error) {
      onError(error)
    }
  }
}

export function createSsrStreamResponse<TRouter extends AnyRouter>(
  router: TRouter,
  response: Response,
): SsrResponse {
  if (!response.body) {
    throw new Error('Invariant failed: SSR stream response requires a body')
  }

  let disposed = false
  return {
    response,
    serverSsrCleanup: 'stream',
    async dispose(reason?: unknown) {
      if (disposed) {
        return
      }
      disposed = true

      // Sever router ownership before asking user/renderer stream machinery to
      // cancel. A custom stream is allowed to ignore cancellation forever.
      router.serverSsr?.cleanup()

      try {
        await response.body!.cancel(reason)
      } catch {
        // Cleanup above already released router SSR state.
      }
    },
  }
}

export function bindSsrResponseToRequest(
  router: AnyRouter | undefined,
  result: HandlerCallbackResult,
  signal: AbortSignal,
): SsrResponse {
  const ssrResponse = normalizeSsrResponse(result)
  if (ssrResponse.serverSsrCleanup !== 'stream') {
    if (signal.aborted) {
      disposeSsrResponseDetached(result, signal.reason)
    }
    return ssrResponse
  }

  const failed = (error: unknown) => {
    router?.serverSsr?.cleanup()
    console.error(error)
  }
  const abort = () => {
    disposeSsrResponseDetached(ssrResponse, signal.reason, failed)
  }
  if (signal.aborted) {
    abort()
    return ssrResponse
  }

  signal.addEventListener('abort', abort, { once: true })
  router?.serverSsr?.onCleanup(() => {
    signal.removeEventListener('abort', abort)
  })
  return ssrResponse
}

export async function replaceSsrResponse(
  result: HandlerCallbackResult,
  response: Response,
  reason?: unknown,
): Promise<SsrResponse> {
  const ssrResponse = normalizeSsrResponse(result)
  await disposeSsrResponse(ssrResponse, reason)
  return { response, serverSsrCleanup: 'none' }
}

export async function stripSsrResponseBody(
  result: HandlerCallbackResult,
  reason?: unknown,
): Promise<SsrResponse> {
  const ssrResponse = normalizeSsrResponse(result)
  await disposeSsrResponse(ssrResponse, reason)
  return {
    response: new Response(null, ssrResponse.response),
    serverSsrCleanup: 'none',
  }
}

export interface HandlerCallback<TRouter extends AnyRouter> {
  (ctx: {
    request: Request
    router: TRouter
    responseHeaders: Headers
  }): HandlerCallbackResult | Promise<HandlerCallbackResult>
}

export function defineHandlerCallback<TRouter extends AnyRouter>(
  handler: HandlerCallback<TRouter>,
): HandlerCallback<TRouter> {
  return handler
}
