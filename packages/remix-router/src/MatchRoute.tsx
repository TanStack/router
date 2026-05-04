/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { useMatchRoute } from './useMatches'
import type { Handle, RemixNode } from '@remix-run/ui'
import type {
  AnyRouter,
  Expand,
  RegisteredRouter,
  ResolveRoute,
} from '@tanstack/router-core'
import type { UseMatchRouteOptions } from './useMatches'

export type MakeMatchRouteOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = UseMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
  /**
   * Static node, or a function rendered with the matched params (or `false`
   * when the route doesn't match).
   */
  children?:
    | RemixNode
    | ((
        params:
          | false
          | Expand<ResolveRoute<TRouter, TFrom, TTo>['types']['allParams']>,
      ) => RemixNode)
}

/**
 * Conditionally render based on whether a route matches the current
 * location. Mirrors `<MatchRoute>` from `@tanstack/react-router`.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/matchRouteComponent
 */
export function MatchRoute<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(handle: Handle<MakeMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>>) {
  const matchRoute = useMatchRoute<TRouter>(handle)

  return (
    props: MakeMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  ): RemixNode => {
    const { children, ...rest } = props as any
    const matchResult = matchRoute(rest)
    if (typeof children === 'function') {
      return (children as any)(matchResult)
    }
    return matchResult ? (children as RemixNode) : null
  }
}
