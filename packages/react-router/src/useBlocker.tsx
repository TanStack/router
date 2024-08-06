import * as React from 'react'
import { useRouter } from './useRouter'
import { type RegisteredRouter, type RouteIds, getRouteApi } from '.'
import type { BlockerFn, BlockerFnArgs } from '@tanstack/history'
import type { ReactNode } from './route'

type BlockerResolver = {
  status: 'idle' | 'blocked'
  proceed: () => void
  reset: () => void
}

type BlockerOpts<TId extends RouteIds<RegisteredRouter['routeTree']>> = {
  blockerFn: BlockerFn
  from?: TId
  to?: TId

  disableBeforeUnload?: boolean | (() => boolean)
  disabled?: boolean
}

export function useBlocker<
  TId extends RouteIds<RegisteredRouter['routeTree']>,
>({
  blockerFn,
  from,
  to,
  disableBeforeUnload = false,
  disabled = false,
}: BlockerOpts<TId>): BlockerResolver {
  const router = useRouter()
  const { history } = router

  const [resolver, setResolver] = React.useState<BlockerResolver>({
    status: 'idle',
    proceed: () => {},
    reset: () => {},
  })

  React.useEffect(() => {
    const blockerFnComposed = async (blockerFnArgs: BlockerFnArgs) => {
      // If a function is provided, it takes precedence over the promise blocker

      let matchesFrom = true
      let matchesTo = true

      if (from) {
        const route = getRouteApi(blockerFnArgs.currentLocation.pathname)
        if (route.id !== from) matchesFrom = false
      }

      if (to) {
        const route = getRouteApi(blockerFnArgs.nextLocation.pathname)
        if (route.id !== to) matchesTo = false
      }

      if (!matchesFrom || !matchesTo) return true

      const shouldBlock = await blockerFn(blockerFnArgs)
      if (!shouldBlock) return true

      const promise = new Promise<boolean>((resolve) => {
        setResolver({
          status: 'blocked',
          proceed: () => resolve(true),
          reset: () => resolve(false),
        })
      })

      const canNavigateAsync = await promise

      setResolver({
        status: 'idle',
        proceed: () => {},
        reset: () => {},
      })

      return canNavigateAsync
    }

    return disabled
      ? undefined
      : history.block(blockerFnComposed, disableBeforeUnload)
  }, [blockerFn, disableBeforeUnload, disabled, history])

  return resolver
}

export function Block({
  blockerFn,
  from,
  to,
  disabled = false,
  children,
}: PromptProps) {
  const resolver = useBlocker({ blockerFn, disabled, from, to })
  return children
    ? typeof children === 'function'
      ? children(resolver)
      : children
    : null
}

export type PromptProps = {
  blockerFn: BlockerFn
  from: string
  to: string
  disabled?: boolean
  children?: ReactNode | (({ proceed, reset }: BlockerResolver) => ReactNode)
}
