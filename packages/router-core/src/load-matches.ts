import { isNotFound } from './not-found'
import { isRedirect } from './redirect'
import { rootRouteId } from './root'
import type { NotFoundError } from './not-found'
import type { ParsedLocation } from './location'
import type { AnyRouteMatch } from './Matches'
import type { AnyRouter } from './router'

export type InnerLoadContext = {
  /** Router for this private load lane. */
  router: AnyRouter
  /** Target location for this private load lane. */
  location: ParsedLocation
  /** Framework render promise returned by pending publication. */
  rendered?: true | Promise<void>
  /** Pending lane was published for presentation; final commit still owns effects. */
  pendingPublished?: true
  /** Private match lane being loaded. */
  matches: Array<AnyRouteMatch>
  /**
   * Set only for preload passes. Contains active/pending match IDs that
   * this pass borrows read-only instead of owning in the cache.
   */
  preload?: Array<string>
  /** Earliest route index with a committed route error. */
  badIndex?: number
  /** Same-href client load should revalidate stale matches. */
  forceStaleReload?: boolean
  /** Callback that publishes pending UI when the lane becomes renderable. */
  onReady?: (matches: Array<AnyRouteMatch>) => void | Promise<void>
  /** Server beforeLoad failure captured during the serial phase. */
  serialFailure?: SerialFailure
  /** Client background reload indices selected during foreground matching. */
  background?: Array<number>
  /** Foreground load must commit even if same-href background reloads exist. */
  requiresCommit?: boolean
}

export type SerialFailure = [index: number, error: unknown]

export type LoadMatchesArg = {
  router: AnyRouter
  location: ParsedLocation
  matches: Array<AnyRouteMatch>
  preload?: Array<string>
  forceReload?: boolean
  background?: Array<number>
  onReady?: (matches: Array<AnyRouteMatch>) => void | Promise<void>
}

export type BackgroundLoad = {
  href: string
  controller: AbortController
}

export const markError = (inner: InnerLoadContext, index: number) => {
  inner.badIndex = Math.min(inner.badIndex ?? index, index)
}

export const getMatchContext = (
  inner: Pick<InnerLoadContext, 'router' | 'matches'>,
  index: number,
  beforeLoadContext: unknown,
): Record<string, unknown> => {
  const parentContext =
    inner.matches[index - 1]?.context ?? inner.router.options.context ?? {}
  const routeContext = inner.matches[index]!.__routeContext
  return routeContext || beforeLoadContext
    ? {
        ...parentContext,
        ...routeContext,
        ...(beforeLoadContext as Record<string, unknown>),
      }
    : parentContext
}

export const settleMatchLoad = (match: AnyRouteMatch): void => {
  const promise = match._.loadPromise
  match._.loadPromise = undefined
  clearTimeout(promise?.pendingTimeout)

  if (promise?.status === 'pending') {
    promise.resolve()
  }
}

export const getNotFoundBoundaryIndex = (
  inner: InnerLoadContext,
  err: NotFoundError,
): number => {
  const requestedRouteId = err.routeId

  let startIndex = requestedRouteId
    ? inner.matches.findIndex((match) => match.routeId === requestedRouteId)
    : inner.matches.length - 1

  if (startIndex === -1) {
    startIndex = 0
  }

  for (let i = startIndex; i >= 0; i--) {
    if (
      inner.router.routesById[inner.matches[i]!.routeId]!.options
        .notFoundComponent
    ) {
      return i
    }
  }

  // If no boundary component is found, preserve explicit routeId targeting behavior,
  // otherwise default to root for untargeted notFounds.
  return requestedRouteId ? startIndex : 0
}

export const normalizeRouteFailure = (
  inner: InnerLoadContext,
  index: number,
  error: unknown,
): unknown => {
  if (process.env.NODE_ENV !== 'production' && error === undefined) {
    error = new Error('Route load failed with undefined')
  }

  const match = inner.matches[index]!
  if (!isRedirect(error) && !isNotFound(error)) {
    try {
      inner.router.routesById[match.routeId]!.options.onError?.(error)
    } catch (onErrorError) {
      error = onErrorError
    }
  }

  if (isNotFound(error)) {
    error.routeId ||= match.routeId
  }

  return error
}

export const getNotFoundBoundaryPatch = (
  inner: InnerLoadContext,
  index: number,
  err: NotFoundError,
): Partial<AnyRouteMatch> => {
  const match = inner.matches[index]!

  err.routeId = match.routeId
  const patch: Partial<AnyRouteMatch> =
    match.routeId === rootRouteId
      ? {
          status: 'success',
          error: undefined,
          isFetching: false,
          globalNotFound: true,
        }
      : {
          status: 'notFound',
          error: err,
          isFetching: false,
        }

  patch.context = getMatchContext(inner, index, match.__beforeLoadContext)

  return patch
}
