import { effect, signal, Signal } from '@angular/core'
import {
  BlockerFnArgs,
  HistoryLocation,
  HistoryAction,
} from '@tanstack/history'
import type {
  AnyRoute,
  AnyRouter,
  ParseRoute,
  RegisteredRouter,
} from '@tanstack/router-core'
import { injectRouter } from './injectRouter'

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
  // TODO: why is disabled needed? It isn't reactive
  disabled?: boolean
  withResolver?: TWithResolver
}

export type InjectBlockerOpts<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = boolean,
> = {
  shouldBlockFn: ShouldBlockFn<TRouter>
  enableBeforeUnload?: boolean | (() => boolean)
  disabled?: boolean
  withResolver?: TWithResolver
}

export function injectBlocker<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = boolean,
>(
  opts: InjectBlockerOpts<TRouter, TWithResolver>,
): TWithResolver extends true ? Signal<BlockerResolver<TRouter>> : void {
  const shouldBlockFn = opts.shouldBlockFn as ShouldBlockFn<AnyRouter>
  const router = injectRouter()

  const resolver = signal<BlockerResolver>({
    status: 'idle',
    current: undefined,
    next: undefined,
    action: undefined,
    proceed: undefined,
    reset: undefined,
  })

  effect((onCleanup) => {
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
            search: parsedLocation.search,
          }
        }
        return {
          routeId: matchedRoutes.foundRoute.id,
          fullPath: matchedRoutes.foundRoute.fullPath,
          pathname: parsedLocation.pathname,
          params: matchedRoutes.routeParams,
          search: parsedLocation.search,
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
        current,
        next,
      })
      if (!opts.withResolver) {
        return shouldBlock
      }

      if (!shouldBlock) {
        return false
      }

      const promise = new Promise<boolean>((resolve) => {
        resolver.set({
          status: 'blocked',
          current,
          next,
          action: blockerFnArgs.action,
          proceed: () => resolve(false),
          reset: () => resolve(true),
        })
      })

      const canNavigateAsync = await promise
      resolver.set({
        status: 'idle',
        current: undefined,
        next: undefined,
        action: undefined,
        proceed: undefined,
        reset: undefined,
      })

      return canNavigateAsync
    }

    const disposeBlock = opts.disabled
      ? undefined
      : router.history.block({
          blockerFn: blockerFnComposed,
          enableBeforeUnload: opts.enableBeforeUnload,
        })

    onCleanup(() => disposeBlock?.())
  })

  return resolver.asReadonly() as any
}
