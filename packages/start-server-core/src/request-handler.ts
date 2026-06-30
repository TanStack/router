import type { OnEarlyHints, ResponseLinkHeaderOptions } from './early-hints'
import type { SsrStreamingOverride } from '@tanstack/router-core/ssr/server'

type BaseContext = {
  nonce?: string
}

type EarlyHintsOptions = {
  /**
   * Fire-and-forget callback for HTTP 103 Early Hints.
   * Only invoked in production (when TSS_DEV_SERVER !== 'true').
   *
   * The `static` phase contains transformed manifest preloads and stylesheets
   * for matched routes.
   * The `dynamic` phase runs after route load, is skipped for redirects, and
   * can contain route `head().links` or empty `hints` and `links` arrays.
   * `hints` and `links` contain only values not emitted in earlier phases.
   * `allHints` and `allLinks` contain all values collected so far for the
   * request. Browsers generally process only the first 103 response for a
   * navigation, so runtimes should usually write at most one Early Hints
   * response.
   *
   * @example
   * ```ts
   * export default {
   *   async fetch(request) {
   *     return handler.fetch(request, {
   *       onEarlyHints: ({ links }) => {
   *         // Send 103 Early Hints via runtime-specific API
   *       }
   *     })
   *   }
   * }
   * ```
   */
  onEarlyHints?: OnEarlyHints
  /**
   * Append collected Early Hints `Link` values to the final HTML response's
   * `Link` header. This is useful as a fallback when the runtime cannot write
   * `103` responses, or for CDNs that generate Early Hints from response
   * `Link` headers.
   *
   * `true` appends all collected static and dynamic links after Start confirms
   * the request is not a redirect. Use `filter` to remove links that are not
   * public and cache-safe for your deployment.
   */
  responseLinkHeader?: boolean | ResponseLinkHeaderOptions
}

type InlineCssOptions = {
  /**
   * Controls whether Start inlines build-collected CSS for this request.
   *
   * This only has an effect when the build was created with
   * `server.build.inlineCss` enabled. Defaults to `true` so builds with inline
   * CSS enabled continue to inline CSS unless a request opts out.
   */
  inlineCss?: boolean
}

type SsrOptions = {
  ssr?: {
    /**
     * Overrides the resolved SSR streaming policy for this request.
     *
     * This is a partial patch on top of the handler-level or built-in policy.
     * For example, `{ head: true }` enables head streaming while preserving
     * the existing render streaming decision.
     */
    streaming?: SsrStreamingOverride
  }
}

export type RequestOptions<TRegister> = EarlyHintsOptions &
  InlineCssOptions &
  SsrOptions &
  (TRegister extends {
    server: { requestContext: infer TRequestContext }
  }
    ? TRequestContext extends undefined
      ? { context?: TRequestContext & BaseContext }
      : { context: TRequestContext & BaseContext }
    : { context?: BaseContext })

// Utility type: true if T has any required keys, else false
type HasRequired<T> = keyof T extends never
  ? false
  : {
        [K in keyof T]-?: undefined extends T[K] ? never : K
      }[keyof T] extends never
    ? false
    : true

export type RequestHandler<TRegister> =
  HasRequired<RequestOptions<TRegister>> extends true
    ? (
        request: Request,
        opts: RequestOptions<TRegister>,
      ) => Promise<Response> | Response
    : (
        request: Request,
        opts?: RequestOptions<TRegister>,
      ) => Promise<Response> | Response
