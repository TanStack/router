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
  Register,
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
  TRegister extends Register = Register,
  TRoute extends AnyRoute = ParseRoute<
    RegisteredRouter<TRegister>['routeTree']
  >,
> = TRoute extends any
  ? ShouldBlockFnLocation<
      TRoute['id'],
      TRoute['fullPath'],
      TRoute['types']['allParams'],
      TRoute['types']['fullSearchSchema']
    >
  : never

type BlockerResolver<TRegister extends Register = Register> =
  | {
      status: 'blocked'
      current: MakeShouldBlockFnLocationUnion<TRegister>
      next: MakeShouldBlockFnLocationUnion<TRegister>
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

type ShouldBlockFnArgs<TRegister extends Register = Register> = {
  current: MakeShouldBlockFnLocationUnion<TRegister>
  next: MakeShouldBlockFnLocationUnion<TRegister>
  action: HistoryAction
}

export type ShouldBlockFn<TRegister extends Register = Register> = (
  args: ShouldBlockFnArgs<TRegister>,
) => boolean | Promise<boolean>
export type UseBlockerOpts<
  TRegister extends Register = Register,
  TWithResolver extends boolean = boolean,
> = {
  shouldBlockFn: ShouldBlockFn<TRegister>
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

export function useBlocker<
  TRegister extends Register = Register,
  TWithResolver extends boolean = false,
>(
  opts: UseBlockerOpts<TRegister, TWithResolver>,
): TWithResolver extends true ? BlockerResolver<TRegister> : void

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

  return resolver
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

export function Block<
  TRegister extends Register = Register,
  TWithResolver extends boolean = boolean,
>(opts: PromptProps<TRegister, TWithResolver>): React.ReactNode

/**
 *  @deprecated Use the UseBlockerOpts property instead
 */
export function Block(opts: LegacyPromptProps): React.ReactNode

export function Block(opts: PromptProps | LegacyPromptProps): React.ReactNode {
  const { children, ...rest } = opts
  const args = _resolvePromptBlockerArgs(rest)

  const resolver = useBlocker(args)
  return children
    ? typeof children === 'function'
      ? children(resolver as any)
      : children
    : null
}

type LegacyPromptProps = {
  blockerFn?: LegacyBlockerFn
  condition?: boolean | any
  children?: React.ReactNode | ((params: BlockerResolver) => React.ReactNode)
}

type PromptProps<
  TRegister extends Register = Register,
  TWithResolver extends boolean = boolean,
  TParams = TWithResolver extends true ? BlockerResolver<TRegister> : void,
> = UseBlockerOpts<TRegister, TWithResolver> & {
  children?: React.ReactNode | ((params: TParams) => React.ReactNode)
}
