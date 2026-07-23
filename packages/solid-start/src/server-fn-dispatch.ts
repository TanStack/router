import { isRedirect } from '@tanstack/router-core'
import { X_TSS_RAW_RESPONSE } from '@tanstack/start-client-core'
import { getResponse } from '@tanstack/start-server-core'
import {
  BODY_FORMAT_HEADER,
  X_CONTENT_RAW,
  getWireCodecOptions,
} from './directive-wire'

/**
 * Options for @solidjs/web's handleServerFunctionRequest that wire TanStack
 * Start semantics into the directive server-fn transport. Called per request
 * from the #tanstack-start-server-fn-dispatch virtual module, inside
 * runWithStartContext (start options / serialization adapters are live).
 */
export function createTanStackDispatchOptions() {
  return {
    codec: getWireCodecOptions(),
    transformResult: (
      _event: unknown,
      result: any,
      ctx: { thrown?: boolean },
    ) => {
      if (ctx.thrown) {
        return result
      }

      // `result` is the { result, error, context } envelope produced by
      // __executeServer (middleware errors, redirects and notFound land in
      // `error` — the client middleware chain handles those after decoding).
      if (result && typeof result === 'object') {
        const unwrapped =
          result.result !== undefined ? result.result : result.error

        if (unwrapped instanceof Response) {
          if (isRedirect(unwrapped)) {
            // Return the redirect Response itself so the SERVER_FN_BASE
            // branch's handleRedirectResponse resolves it and converts it to
            // serialized-redirect JSON for scripted calls. X-Content-Raw only
            // forces verbatim passthrough out of handleServerFunctionRequest;
            // postprocessDirectiveResponse strips it again.
            unwrapped.headers.set(X_CONTENT_RAW, 'true')
            return unwrapped
          }

          // Raw Response result: hand it to the client untouched.
          unwrapped.headers.set(X_TSS_RAW_RESPONSE, 'true')
          unwrapped.headers.set(X_CONTENT_RAW, 'true')
          return unwrapped
        }
      }

      return result
    },
    // Calls without the client runtime (no instance header): native no-JS
    // form posts and direct HTTP requests. Mirror the split transport, which
    // returned the unwrapped result as a plain response.
    handleNoJS: (result: any, _request: Request, _args: Array<unknown>) => {
      const unwrapped =
        result && typeof result === 'object'
          ? (result.result ?? result.error ?? result)
          : result

      if (unwrapped instanceof Response) {
        return unwrapped
      }

      if (typeof unwrapped === 'string') {
        return new Response(unwrapped, {
          headers: { 'content-type': 'text/plain;charset=UTF-8' },
        })
      }

      return Response.json(unwrapped ?? null)
    },
  }
}

/**
 * Post-processing for responses returned by handleServerFunctionRequest with
 * the TanStack dispatch options:
 *
 * - Redirect Responses passed through verbatim must not keep the
 *   X-Content-Raw marker, or handleRedirectResponse's JSON replacement
 *   (which copies the redirect's headers) would make the client treat the
 *   serialized redirect as a raw response.
 * - setResponseStatus()/statusText from the request-scoped h3 event are
 *   applied to codec-encoded responses (the handler itself only knows about
 *   ResponseEnvelope statuses). Headers set on the event are merged by the
 *   outer requestHandler (h3 toResponse), so only status needs mapping.
 */
export function postprocessDirectiveResponse(response: Response): Response {
  if (isRedirect(response)) {
    response.headers.delete(X_CONTENT_RAW)
    return response
  }

  if (
    response.headers.has(X_CONTENT_RAW) ||
    response.headers.get(X_TSS_RAW_RESPONSE) === 'true'
  ) {
    return response
  }

  if (response.headers.has(BODY_FORMAT_HEADER)) {
    const alsResponse = getResponse()
    const status = alsResponse.status ?? response.status
    const statusText = alsResponse.statusText ?? ''
    if (
      status !== response.status ||
      (statusText && statusText !== response.statusText)
    ) {
      return new Response(response.body, {
        status,
        statusText,
        headers: response.headers,
      })
    }
  }

  return response
}
