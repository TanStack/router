import * as React from 'react'
import { useRouter } from './useRouter'
import type {
  BlockerFnArgs,
  HistoryAction,
  HistoryLocation,
} from '@tanstack/history'
import type { AnyRoute, ReactNode } from './route'
import type { ParseRoute } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'

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

type BlockerResolver = {
  status: 'idle' | 'blocked'
  proceed: () => void
  reset: () => void
} & (
  | {
      status: 'blocked'
      current: MakeShouldBlockFnLocationUnion
      next: MakeShouldBlockFnLocationUnion
      action: HistoryAction
    }
  | {
      status: 'idle'
      current: undefined
      next: undefined
      action: undefined
    }
)

type ShouldBlockFnArgs = {
  current: MakeShouldBlockFnLocationUnion
  next: MakeShouldBlockFnLocationUnion
  action: HistoryAction
}
export type ShouldBlockFn = (
  args: ShouldBlockFnArgs,
) => boolean | Promise<boolean>
export type UseBlockerOpts<TWithResolver extends boolean = boolean> = {
  shouldBlockFn: ShouldBlockFn
  enableBeforeUnload?: boolean | (() => boolean)
  disabled?: boolean
  withResolver?: TWithResolver
}

type LegacyBlockerFn = () => Promise<any> | any
type LegacyBlockerOpts = {
  blockerFn?: LegacyBlockerFn
  condition?: boolean | any
}

function _resolveBlockerOpts(
  opts?: UseBlockerOpts | LegacyBlockerOpts | LegacyBlockerFn,
  condition?: boolean | any,
): UseBlockerOpts {
  if (opts === undefined) {
    return {
      shouldBlockFn: () => true,
      withResolver: false,
    }
  }

  if ('shouldBlockFn' in opts) {
    return opts
  }

  if (typeof opts === 'function') {
    const shouldBlock = Boolean(condition ?? true)

    const _customBlockerFn = async () => {
      if (shouldBlock) return await opts()
      return false
    }

    return {
      shouldBlockFn: _customBlockerFn,
      enableBeforeUnload: shouldBlock,
      withResolver: false,
    }
  }

  const shouldBlock = Boolean(opts.condition ?? true)
  const fn = opts.blockerFn

  const _customBlockerFn = async () => {
    if (shouldBlock && fn !== undefined) {
      return await fn()
    }
    return shouldBlock
  }

  return {
    shouldBlockFn: _customBlockerFn,
    enableBeforeUnload: shouldBlock,
    withResolver: fn === undefined,
  }
}

/**
 * @deprecated Use the shouldBlockFn property instead
 */
export function useBlocker(blockerFnOrOpts?: LegacyBlockerOpts): BlockerResolver

/**
 * @deprecated Use the UseBlockerOpts object syntax instead
 */
export function useBlocker(
  blockerFn?: LegacyBlockerFn,
  condition?: boolean | any,
): BlockerResolver

export function useBlocker<TWithResolver extends boolean = false>(
  opts: UseBlockerOpts<TWithResolver>,
): TWithResolver extends true ? BlockerResolver : void

export function useBlocker(
  opts?: UseBlockerOpts | LegacyBlockerOpts | LegacyBlockerFn,
  condition?: boolean | any,
): BlockerResolver | void {
  const {
    shouldBlockFn,
    enableBeforeUnload = true,
    disabled = false,
    withResolver = false,
  } = _resolveBlockerOpts(opts, condition)

  const router = useRouter()
  const { history } = router

  const [resolver, setResolver] = React.useState<BlockerResolver>({
    status: 'idle',
    current: undefined,
    next: undefined,
    action: undefined,
    proceed: () => {},
    reset: () => {},
  })

  React.useEffect(() => {
    const blockerFnComposed = async (blockerFnArgs: BlockerFnArgs) => {
      function getLocation(
        location: HistoryLocation,
      ): AnyShouldBlockFnLocation {
        const parsedLocation = router.parseLocation(undefined, location)
        const matchedRoutes = router.getMatchedRoutes(parsedLocation)
        if (matchedRoutes.foundRoute === undefined) {
          throw new Error(`No route found for location ${location.href}`)
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

      const shouldBlock = await shouldBlockFn({
        action: blockerFnArgs.action,
        current,
        next,
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
        proceed: () => {},
        reset: () => {},
      })

      return canNavigateAsync
    }

    return disabled
      ? undefined
      : history.block({ blockerFn: blockerFnComposed, enableBeforeUnload })
  }, [shouldBlockFn, enableBeforeUnload, disabled, withResolver, history])

  if (withResolver) {
    return resolver
  }
}

const _resolvePromptBlockerArgs = (
  props: PromptProps | LegacyPromptProps,
): UseBlockerOpts => {
  if ('shouldBlockFn' in props) {
    return { ...props }
  }

  const shouldBlock = Boolean(props.condition ?? true)
  const fn = props.blockerFn

  const _customBlockerFn = async () => {
    if (shouldBlock && fn !== undefined) {
      return await fn()
    }
    return shouldBlock
  }

  return {
    shouldBlockFn: _customBlockerFn,
    enableBeforeUnload: shouldBlock,
    withResolver: fn === undefined,
  }
}

/**
 *  @deprecated Use the UseBlockerOpts property instead
 */
export function Block(opts: LegacyBlockerOpts): ReactNode

export function Block(opts: UseBlockerOpts): ReactNode

export function Block(opts: PromptProps | LegacyPromptProps): ReactNode {
  const { children, ...rest } = opts
  const args = _resolvePromptBlockerArgs(rest)

  const resolver = useBlocker(args)
  return children
    ? typeof children === 'function'
      ? children(resolver)
      : children
    : null
}

type LegacyPromptProps = {
  blockerFn?: LegacyBlockerFn
  condition?: boolean | any
  children?: ReactNode | (({ proceed, reset }: BlockerResolver) => ReactNode)
}

export type PromptProps = UseBlockerOpts & {
  children?: ReactNode | (({ proceed, reset }: BlockerResolver) => ReactNode)
}
