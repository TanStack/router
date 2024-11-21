import * as React from 'react'
import { useRouter } from './useRouter'
import { matchPathname } from './path'
import type { MatchLocation } from './RouterProvider'
import type { BlockerFn, BlockerFnArgs } from '@tanstack/history'

type Optional<T> =
  | T
  | {
      [K in keyof T]?: never
    }

type BlockerResolver = {
  status: 'idle' | 'blocked'
  proceed: () => void
  reset: () => void
}

export type UseBlockerOpts = {
  blockerFn: BlockerFn

  enableBeforeUnload?: boolean | (() => boolean)
  disabled?: boolean
  skipResolver?: boolean
} & Optional<{
  from: MatchLocation['to']
  fromMatchOpts?: Omit<MatchLocation, 'to'>
}> &
  Optional<{
    to: MatchLocation['to']
    toMatchOpts?: Omit<MatchLocation, 'to'>
  }>

export function useBlocker({
  blockerFn,
  to,
  toMatchOpts,

  from,
  fromMatchOpts,

  enableBeforeUnload = true,
  disabled = false,
  skipResolver = false,
}: UseBlockerOpts): BlockerResolver {
  const router = useRouter()
  const { history } = router

  const [resolver, setResolver] = React.useState<BlockerResolver>({
    status: 'idle',
    proceed: () => {},
    reset: () => {},
  })

  React.useEffect(() => {
    const blockerFnComposed = async (blockerFnArgs: BlockerFnArgs) => {
      let matchesFrom = true
      let matchesTo = true

      if (from) {
        const match = matchPathname(
          router.basepath,
          blockerFnArgs.currentLocation.pathname,
          {
            to: from,
            ...fromMatchOpts,
          },
        )
        if (!match) matchesFrom = false
      }

      if (to) {
        const match = matchPathname(
          router.basepath,
          blockerFnArgs.nextLocation.pathname,
          {
            to,
            ...toMatchOpts,
          },
        )
        if (!match) matchesTo = false
      }

      if (!matchesFrom || !matchesTo) return false

      const shouldBlock = await blockerFn(blockerFnArgs)
      if (skipResolver) return shouldBlock

      if (!shouldBlock) return false

      const promise = new Promise<boolean>((resolve) => {
        setResolver({
          status: 'blocked',
          proceed: () => resolve(false),
          reset: () => resolve(true),
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
      : history.block({ blockerFn: blockerFnComposed, enableBeforeUnload })
  }, [blockerFn, enableBeforeUnload, disabled, skipResolver, history, from, to])

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
  children?:
    | React.ReactNode
    | (({ proceed, reset }: BlockerResolver) => React.ReactNode)
}
