import type { RouteIds } from './routeInfo'
import type { RegisteredRouter } from './router'

export type NotFoundError = {
  /**
    @deprecated
    Use `routeId: rootRouteId` instead
  */
  global?: boolean
  /**
    @private
    Do not use this. It's used internally to indicate a path matching error
  */
  _global?: boolean
  data?: any
  throw?: boolean
  routeId?: RouteIds<RegisteredRouter['routeTree']>
  headers?: HeadersInit
}

export function notFound(options: NotFoundError = {}) {
  ;(options as any).isNotFound = true
  if (options.throw) throw options
  return options
}

export function isNotFound(obj: any): obj is NotFoundError {
  return !!obj?.isNotFound
}
