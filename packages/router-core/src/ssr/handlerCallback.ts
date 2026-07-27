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

export async function disposeSsrResponse(
  response: SsrResponse,
  reason?: unknown,
): Promise<void> {
  if (response.serverSsrCleanup === 'stream') {
    await response.dispose(reason)
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

  const body = ssrResponse.response.body
  if (body && !body.locked) {
    void body.cancel(reason).catch(onError)
  }
}

function ownResponseBody(
  response: Response,
  onTerminal: (reason?: unknown) => void,
): [Response, (reason?: unknown) => void] {
  const reader = response.body!.getReader()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let terminal = false
  const finish = (reason?: unknown) => {
    terminal = true
    onTerminal(reason)
  }
  const cancel = (reason?: unknown): Promise<void> | undefined => {
    if (!terminal) {
      finish(reason)
      return reader.cancel(reason)
    }
    return
  }
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl
    },
    async pull(ctrl) {
      try {
        const { done, value } = await reader.read()
        if (terminal) {
          return
        }
        if (done) {
          finish()
          ctrl.close()
        } else {
          ctrl.enqueue(value)
        }
      } catch (error) {
        if (!terminal) {
          finish(error)
          ctrl.error(error)
        }
      }
    },
    cancel,
  })
  return [
    new Response(body, response),
    (reason) => {
      if (!terminal) {
        controller.error(reason)
        finish(reason)
        void reader.cancel(reason).catch(console.error)
      }
    },
  ]
}

function ownSsrResponse(
  response: Response,
  onTerminal: (reason?: unknown) => void,
): Extract<SsrResponse, { serverSsrCleanup: 'stream' }> {
  const [ownedResponse, dispose] = ownResponseBody(response, onTerminal)
  return {
    response: ownedResponse,
    serverSsrCleanup: 'stream',
    async dispose(reason?: unknown) {
      dispose(reason)
    },
  }
}

export function createSsrStreamResponse<TRouter extends AnyRouter>(
  router: TRouter,
  response: Response,
): SsrResponse {
  if (!response.body) {
    throw new Error('Invariant failed: SSR stream response requires a body')
  }

  return ownSsrResponse(response, () => router.serverSsr?.cleanup())
}

export function _transferSsrResponse(
  owner: Extract<SsrResponse, { serverSsrCleanup: 'stream' }>,
  response: Response & { body: ReadableStream<Uint8Array> },
): SsrResponse {
  return ownSsrResponse(response, (reason) => {
    disposeSsrResponseDetached(owner, reason)
  })
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
      return ssrResponse
    }
    const body = ssrResponse.response.body
    if (!body) {
      return ssrResponse
    }
    let abort = () => {}
    const [response, dispose] = ownResponseBody(ssrResponse.response, () => {
      signal.removeEventListener('abort', abort)
    })
    abort = () => dispose(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    return { response, serverSsrCleanup: 'none' }
  }
  const failed = (error: unknown) => {
    router?.serverSsr?.cleanup()
    console.error(error)
  }
  if (!ssrResponse.response.body) {
    disposeSsrResponseDetached(ssrResponse, signal.reason, failed)
    return { response: ssrResponse.response, serverSsrCleanup: 'none' }
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

async function disposeReplacedSsrResponse(
  result: HandlerCallbackResult,
  reason?: unknown,
): Promise<SsrResponse> {
  const ssrResponse = normalizeSsrResponse(result)
  if (ssrResponse.serverSsrCleanup === 'stream') {
    await ssrResponse.dispose(reason)
  } else {
    disposeSsrResponseDetached(ssrResponse, reason)
  }
  return ssrResponse
}

export async function replaceSsrResponse(
  result: HandlerCallbackResult,
  response: Response,
  reason?: unknown,
): Promise<SsrResponse> {
  await disposeReplacedSsrResponse(result, reason)
  return { response, serverSsrCleanup: 'none' }
}

export async function stripSsrResponseBody(
  result: HandlerCallbackResult,
  reason?: unknown,
): Promise<SsrResponse> {
  const ssrResponse = await disposeReplacedSsrResponse(result, reason)
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
