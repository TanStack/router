import * as React from 'react'
import { useRouter } from './useRouter'
import type {
  BlockerFnArgs,
  HistoryAction,
  HistoryLocation,
} from '@tanstack/history'
import type {
  AnyRoute,
  AnyRouter,
  ParseRoute,
  RegisteredRouter,
} from '@tanstack/router-core'

interface ShouldBlockFnLocation<
  out TRouteId,
  out TFullPath,
  out TAllParams,
  out TFullSearchSchema,
> {
  routeId: TRouteId
  fullPath: TFullPath
  pathname: string
  params: TAllParams
  search: TFullSearchSchema
}

type AnyShouldBlockFnLocation = ShouldBlockFnLocation<any, any, any, any>
type MakeShouldBlockFnLocationUnion<
  TRouter extends AnyRouter = RegisteredRouter,
  TRoute extends AnyRoute = ParseRoute<TRouter['routeTree']>,
> = TRoute extends any
  ? ShouldBlockFnLocation<
      TRoute['id'],
      TRoute['fullPath'],
      TRoute['types']['allParams'],
      TRoute['types']['fullSearchSchema']
    >
  : never

type BlockerResolver<TRouter extends AnyRouter = RegisteredRouter> =
  | {
      status: 'blocked'
      current: MakeShouldBlockFnLocationUnion<TRouter>
      next: MakeShouldBlockFnLocationUnion<TRouter>
      action: HistoryAction
      proceed: () => void
      reset: () => void
    }
  | {
      status: 'idle'
      current: undefined
      next: undefined
      action: undefined
      proceed: undefined
      reset: undefined
    }

type ShouldBlockFnArgs<TRouter extends AnyRouter = RegisteredRouter> = {
  current: MakeShouldBlockFnLocationUnion<TRouter>
  next: MakeShouldBlockFnLocationUnion<TRouter>
  action: HistoryAction
}

export type ShouldBlockFn<TRouter extends AnyRouter = RegisteredRouter> = (
  args: ShouldBlockFnArgs<TRouter>,
) => boolean | Promise<boolean>

export type UseBlockerOpts<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = boolean,
> = {
  shouldBlockFn: ShouldBlockFn<TRouter>
  enableBeforeUnload?: boolean | (() => boolean)
  disabled?: boolean
  withResolver?: TWithResolver
}

function _resolveBlockerOpts<
  TRouter extends AnyRouter,
  TWithResolver extends boolean,
>(
  opts?: UseBlockerOpts<TRouter, TWithResolver>,
): UseBlockerOpts<TRouter, TWithResolver> {
  if (opts === undefined) {
    return {
      shouldBlockFn: () => true,
      withResolver: false,
    } as unknown as UseBlockerOpts<TRouter, TWithResolver>
  }
  return opts
}

/**
 * Block navigation based on a condition.
 *
 * Options:
 * - `shouldBlockFn`: A function that returns whether to block navigation
 * - `disabled`: Disable the blocker
 * - `withResolver`: If true, returns a resolver object for custom UI
 *
 * @returns A resolver object if `withResolver` is true, otherwise void.
 */
export function useBlocker<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = false,
>(
  opts: UseBlockerOpts<TRouter, TWithResolver>,
): TWithResolver extends true ? BlockerResolver<TRouter> : void {
  const {
    shouldBlockFn,
    enableBeforeUnload = false, // Disabled by default on native
    disabled = false,
    withResolver = false,
  } = _resolveBlockerOpts(opts)

  const router = useRouter()
  const { history } = router

  const [resolver, setResolver] = React.useState<BlockerResolver>({
    status: 'idle',
    current: undefined,
    next: undefined,
    action: undefined,
    proceed: undefined,
    reset: undefined,
  })

  React.useEffect(() => {
    const blockerFnComposed = async (blockerFnArgs: BlockerFnArgs) => {
      function getLocation(
        location: HistoryLocation,
      ): AnyShouldBlockFnLocation {
        const parsedLocation = router.parseLocation(location)
        const matchedRoutes = router.getMatchedRoutes(parsedLocation.pathname)
        if (matchedRoutes.foundRoute === undefined) {
          return {
            routeId: '__notFound__',
            fullPath: parsedLocation.pathname,
            pathname: parsedLocation.pathname,
            params: matchedRoutes.routeParams,
            search: router.options.parseSearch(location.search),
          }
        }

        return {
          routeId: matchedRoutes.foundRoute.id,
          fullPath: matchedRoutes.foundRoute.fullPath,
          pathname: parsedLocation.pathname,
          params: matchedRoutes.routeParams,
          search: router.options.parseSearch(location.search),
        }
      }

      const current = getLocation(blockerFnArgs.currentLocation)
      const next = getLocation(blockerFnArgs.nextLocation)

      if (
        current.routeId === '__notFound__' &&
        next.routeId !== '__notFound__'
      ) {
        return false
      }

      const shouldBlock = await shouldBlockFn({
        action: blockerFnArgs.action,
        current: current as any,
        next: next as any,
      })
      if (!withResolver) {
        return shouldBlock
      }

      if (!shouldBlock) {
        return false
      }

      const promise = new Promise<boolean>((resolve) => {
        setResolver({
          status: 'blocked',
          current,
          next,
          action: blockerFnArgs.action,
          proceed: () => resolve(false),
          reset: () => resolve(true),
        })
      })

      const canNavigateAsync = await promise
      setResolver({
        status: 'idle',
        current: undefined,
        next: undefined,
        action: undefined,
        proceed: undefined,
        reset: undefined,
      })

      return canNavigateAsync
    }

    return disabled
      ? undefined
      : history.block({ blockerFn: blockerFnComposed, enableBeforeUnload })
  }, [
    shouldBlockFn,
    enableBeforeUnload,
    disabled,
    withResolver,
    history,
    router,
  ])

  return resolver as any
}

type BlockProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = boolean,
  TParams = TWithResolver extends true ? BlockerResolver<TRouter> : void,
> = UseBlockerOpts<TRouter, TWithResolver> & {
  children?: React.ReactNode | ((params: TParams) => React.ReactNode)
}

/**
 * Declarative component wrapper for useBlocker.
 * Renders children with optional access to blocker resolver state.
 */
export function Block<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = boolean,
>(opts: BlockProps<TRouter, TWithResolver>): React.ReactNode {
  const { children, ...rest } = opts
  const resolver = useBlocker(rest as any)
  return children
    ? typeof children === 'function'
      ? children(resolver as any)
      : children
    : null
}
