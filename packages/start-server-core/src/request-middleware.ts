import { safeObjectMerge } from '@tanstack/start-client-core'
import { isPromise } from '@tanstack/router-core'
import {
  disposeSsrResponse,
  isSsrResponse,
  waitForRequest,
} from '@tanstack/router-core/ssr/server'
import {
  reconcileResponse,
  restoreResponseProtocol,
  transferResponseProtocol,
} from './internal-request-response'
import {
  DeferredResponse,
  toThrownServerFnResponse,
} from './server-functions-handler'
import type { StartEvent } from './internal-request-response'
import type {
  HandlerCallbackResult,
  SsrResponse,
} from '@tanstack/router-core/ssr/server'

/**
 * The request middleware pipeline of the Start handler: it runs middleware
 * around a terminal handler and owns the response they pass along. Kept in
 * a module of its own so that the test helpers run the same pipeline.
 */

type TODO = any

const IS_DEV = process.env.NODE_ENV === 'development'

// Reusable error messages
const ERR_NO_RESPONSE = IS_DEV
  ? `It looks like you forgot to return a response from your server route handler. If you want to defer to the app router, make sure to have a component set in this route.`
  : 'Internal Server Error'

const ERR_NO_DEFER = IS_DEV
  ? `You cannot defer to the app router if there is no component defined on this route.`
  : 'Internal Server Error'

export function throwRouteHandlerError(): never {
  throw new Error(ERR_NO_RESPONSE)
}

export function throwIfMayNotDefer(): never {
  throw new Error(ERR_NO_DEFER)
}

export function getResponseFromResult(result: TODO): TODO {
  return isSsrResponse(result) || result instanceof Response
    ? result
    : result?.response
}

type StreamSsrResponse = Extract<SsrResponse, { serverSsrCleanup: 'stream' }>

type ResponseBody = NonNullable<Response['body']>
type ResponseWithBody = Response & { readonly body: ResponseBody }

/** The context object threaded through one middleware pipeline. */
export interface PipelineContext {
  request: Request
  pathname: string
  handlerType: 'serverFn' | 'router'
  context: Record<string, unknown>
  params?: Record<string, unknown>
  response?: Response
  // Middleware may add arbitrary own properties through `next(ctx)`.
  [key: string]: unknown
}

interface MiddlewareResponseOwnership {
  response: ResponseWithBody
  sourceBody: ResponseBody
  streamResponse?: StreamSsrResponse
}

export function disposeResponseResult(result: TODO, reason: unknown): void {
  const response = getResponseFromResult(result)
  if (isSsrResponse(response) || response instanceof Response) {
    disposeSsrResponse(response, reason)
  }
}

/**
 * A new body continues the owned one when it is the same stream, or when the
 * owned body is already being read, as by a pipe, a tee, or a `Response` that
 * copies a body by reading it (Bun, or a wrapped global `Response`). Start
 * cannot tell such a reader from one that stops early, so it disposes only an
 * unread body. A stream whose reader stops early ends with the request's abort
 * or the SSR stream's lifetime limit.
 */
function inheritsResponseOwnership(
  ownership: MiddlewareResponseOwnership,
  body: ResponseBody,
): boolean {
  const ownedBody = ownership.response.body
  return body === ownedBody || ownedBody.locked
}

function disposeResponseOwnership(
  ownership: MiddlewareResponseOwnership,
  reason: unknown,
): void {
  const { response, sourceBody, streamResponse } = ownership
  streamResponse?.dispose(reason)
  if (!streamResponse || response.body !== sourceBody) {
    void response.body.cancel(reason).catch(() => {})
  }
}

function getOwnedResponse(
  ownership: MiddlewareResponseOwnership,
): HandlerCallbackResult {
  const { response, sourceBody, streamResponse } = ownership
  if (!streamResponse) {
    return response
  }
  if (streamResponse.response === response && response.body === sourceBody) {
    return streamResponse
  }
  if (response.body === sourceBody) {
    return { ...streamResponse, response }
  }
  return {
    ...streamResponse,
    response,
    dispose(reason): undefined {
      disposeResponseOwnership(ownership, reason)
    },
  }
}

export function createLateResponseDisposer(signal: AbortSignal) {
  return (result: TODO) => disposeResponseResult(result, signal.reason)
}

/**
 * Compose middleware around a terminal response handler. With no middleware
 * the terminal runs directly.
 */
export async function executeMiddleware(
  middlewares: Array<TODO>,
  terminal: TODO,
  ctx: PipelineContext,
  signal: AbortSignal,
  event: StartEvent,
  terminalNext?: TODO,
): Promise<HandlerCallbackResult> {
  let index = -1
  let responseOwnership: MiddlewareResponseOwnership | undefined
  // Invocations form one chain: invocation `d` runs middleware `d` and calls
  // next() at most once; the pipeline itself is depth -1. Once an invocation
  // returns, a result of next() still pending below it is abandoned: it must
  // not replace or cancel the response that invocation chose (for example the
  // winner of a `Promise.race`). A caller at depth `d` is therefore abandoned
  // when `returnedDepth <= d`, where this is the shallowest returned depth.
  let returnedDepth = Infinity
  const disposeAbandonedResult = createLateResponseDisposer(signal)

  const adoptResponse = (
    exposed: Response | undefined,
    streamResponse?: StreamSsrResponse,
  ) => {
    const current = responseOwnership
    // Read the body once: the getter can allocate a stream for a response
    // that has not exposed one yet.
    const body = exposed instanceof Response ? exposed.body : null
    // `exposed` is a Response with this body whenever `body` is set.
    const response = exposed as ResponseWithBody
    if (streamResponse && !body && streamResponse !== current?.streamResponse) {
      streamResponse.dispose('Response body dropped by Start reconciliation')
    }
    if (current && current.response === exposed) {
      current.streamResponse ??= streamResponse
    } else if (current && body && inheritsResponseOwnership(current, body)) {
      // A wrapper around the same body stream carries the same encoded bytes,
      // so it keeps the transport requirements that decode them.
      if (body === current.response.body) {
        transferResponseProtocol(current.response, response)
      }
      current.response = response
      current.streamResponse ??= streamResponse
    } else {
      if (current) {
        responseOwnership = undefined
        disposeResponseOwnership(current, 'middleware response replaced')
      }
      responseOwnership = body
        ? { response, sourceBody: body, streamResponse }
        : undefined
    }
    ctx.response = exposed
  }

  const disposeCurrentBody = (reason: string) => {
    const current = responseOwnership
    responseOwnership = undefined
    if (current) {
      disposeResponseOwnership(current, reason)
    }
  }

  const setResponse = (response: TODO, caller: number) => {
    // The owned response is already adopted; only helper state can still
    // change it.
    const owned =
      response !== undefined && response === responseOwnership?.response
    const ssrResponse = !owned && isSsrResponse(response) ? response : undefined
    const exposed: Response | undefined = ssrResponse
      ? ssrResponse.response
      : response

    if (returnedDepth <= caller) {
      if (exposed !== ctx.response) {
        disposeResponseResult(response, 'late middleware response')
      }
      return
    }
    if (!owned) {
      // Dispose a replaced body before reading helper state: cancellation and
      // SSR cleanup callbacks may set headers on the response that replaces it.
      adoptResponse(
        exposed,
        ssrResponse?.serverSsrCleanup === 'stream' ? ssrResponse : undefined,
      )
    }
    if (exposed instanceof Response) {
      const reconciled = reconcileResponse(exposed, event, disposeCurrentBody)
      if (reconciled !== exposed) {
        adoptRebuilt(exposed, reconciled)
      }
    }
  }

  // Start rebuilds the owned response around its body, or without a body when
  // the response cannot have one. A rebuilt body takes over ownership without
  // comparing streams: a wrapped global `Response` copies it into a new one.
  const adoptRebuilt = (exposed: Response, rebuilt: Response) => {
    const current = responseOwnership
    if (current?.response === exposed && rebuilt.body) {
      current.response = rebuilt as ResponseWithBody
      ctx.response = rebuilt
    } else {
      adoptResponse(rebuilt)
    }
  }

  let nextPromise: Promise<TODO> | undefined

  function next(nextCtx?: TODO): Promise<TODO> {
    // Only the deepest started invocation can call next().
    const result = runNext(index, nextCtx)
    nextPromise = result
    return result
  }

  async function runNext(caller: number, nextCtx?: TODO): Promise<TODO> {
    signal.throwIfAborted()

    // Merge context if provided using safeObjectMerge for prototype pollution prevention
    if (nextCtx) {
      if (nextCtx.context) {
        ctx.context = safeObjectMerge(ctx.context, nextCtx.context)
      }
      // Copy own properties except context (Object.keys returns only own
      // enumerable properties). An indexed loop avoids the iterator protocol.
      const keys = Object.keys(nextCtx)
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!
        if (key === 'response') {
          setResponse(nextCtx.response, caller)
        } else if (key !== 'context') {
          ctx[key] = nextCtx[key]
        }
      }
    }

    const depth = ++index
    const isTerminal = depth === middlewares.length
    const middleware =
      depth < middlewares.length
        ? middlewares[depth]
        : isTerminal
          ? terminal
          : undefined
    const middlewareNext = isTerminal && terminalNext ? terminalNext : next
    if (!middleware) {
      return ctx
    }

    let result: TODO
    try {
      const pending = middleware({ ...ctx, next: middlewareNext })
      // A directly returned next() promise already propagates request aborts.
      if (nextPromise && pending === nextPromise) {
        nextPromise = undefined
        result = await pending
        signal.throwIfAborted()
      } else if (!isPromise(pending)) {
        result = pending
        signal.throwIfAborted()
      } else {
        result = await waitForRequest(
          pending,
          signal,
          disposeAbandonedResult,
          disposeAbandonedResult,
        )
      }
    } catch (err) {
      if (depth < returnedDepth) {
        returnedDepth = depth
      }
      if (returnedDepth > caller) {
        // Middleware can replace next()'s shared response before throwing.
        // Track that body for cleanup without rebuilding a body it may have
        // already locked, consumed, or transferred.
        adoptResponse(ctx.response)
      }
      if (signal.aborted) {
        if (result !== undefined) {
          disposeAbandonedResult(result)
        }
        if (err !== signal.reason) {
          disposeAbandonedResult(err)
        }
        throw signal.reason
      }
      if (err instanceof Response) {
        // A thrown Response replies to the request. For a server function
        // call, the client rejects the call with it.
        setResponse(
          ctx.handlerType === 'serverFn' ? toThrownServerFnResponse(err) : err,
          caller,
        )
        return ctx
      }
      throw err
    }
    if (depth < returnedDepth) {
      returnedDepth = depth
    }

    if (isTerminal && terminalNext && !result) {
      throwRouteHandlerError()
    }

    if (isTerminal && !terminalNext && result instanceof DeferredResponse) {
      if (returnedDepth > caller) {
        // Cleanup may write response helpers. Construct only after it has run,
        // then publish without rechecking headers that no user has received.
        adoptResponse(undefined)
        adoptResponse(result.createResponse(event))
      }
      return ctx
    }

    if (result && result !== ctx) {
      const response = getResponseFromResult(result)
      // Select the replacement before reconciling: middleware may already
      // have transferred or piped the previous response's body.
      if (response !== undefined) {
        // Middleware can assign next()'s shared response and then return
        // another one, such as a 304 after transforming the body. Track the
        // assigned body first, so the replacement disposes it, without
        // rebuilding a body it may have already locked or consumed.
        if (
          ctx.response !== responseOwnership?.response &&
          ctx.response !== response &&
          returnedDepth > caller
        ) {
          adoptResponse(ctx.response)
        }
        setResponse(response, caller)
      } else {
        setResponse(ctx.response, caller)
      }
      if (
        returnedDepth > caller &&
        response !== result &&
        result.context &&
        result.context !== ctx.context
      ) {
        ctx.context = safeObjectMerge(ctx.context, result.context)
      }
    } else {
      setResponse(ctx.response, caller)
    }

    return ctx
  }

  try {
    await runNext(-1)
    let response = ctx.response
    if (!response) {
      throwRouteHandlerError()
    }
    if (signal.aborted) {
      throw signal.reason
    }
    returnedDepth = -1
    // Middleware can change protocol headers directly on a server-function
    // reply, the only response that has them. Restore them once, as the reply
    // leaves the pipeline; without middleware only Start has handled it.
    if (middlewares.length && ctx.handlerType === 'serverFn') {
      const restored = restoreResponseProtocol(response, event)
      if (restored !== response) {
        adoptRebuilt(response, restored)
        response = restored
      }
    }
    return responseOwnership ? getOwnedResponse(responseOwnership) : response
  } catch (err) {
    returnedDepth = -1
    if (responseOwnership) {
      disposeResponseOwnership(
        responseOwnership,
        signal.aborted ? signal.reason : err,
      )
    }
    throw err
  }
}
