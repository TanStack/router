import * as React from 'react'
import { useRouter } from './useRouter'
import { matchPathname } from './path'
import type { MatchLocation } from './RouterProvider'
import type { BlockerFn, BlockerFnArgs } from '@tanstack/history'
import type { ReactNode } from './route'

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
  shouldBlockFn: BlockerFn

  enableBeforeUnload?: boolean | (() => boolean)
  disabled?: boolean
  withResolver?: boolean
} & Optional<{
  from: MatchLocation['to']
  fromMatchOpts?: Omit<MatchLocation, 'to'>
}> &
  Optional<{
    to: MatchLocation['to']
    toMatchOpts?: Omit<MatchLocation, 'to'>
  }>

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

  if (typeof opts === 'function') {
    const shouldBlock = Boolean(condition ?? true)

    const _customBlockerFn: BlockerFn = async () => {
      if (shouldBlock) return await opts()
      return false
    }

    return {
      shouldBlockFn: _customBlockerFn,
      enableBeforeUnload: shouldBlock,
      withResolver: false,
    }
  }

  if ('shouldBlockFn' in opts) return opts

  const shouldBlock = Boolean(opts.condition ?? true)
  const fn = opts.blockerFn

  const _customBlockerFn: BlockerFn = async () => {
    if (shouldBlock && fn !== undefined) return await fn()
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
 * @deprecated Use the BlockerOpts object syntax instead
 */
export function useBlocker(
  blockerFn?: LegacyBlockerFn,
  condition?: boolean | any,
): BlockerResolver

export function useBlocker(opts: UseBlockerOpts): BlockerResolver

export function useBlocker(
  opts?: UseBlockerOpts | LegacyBlockerOpts | LegacyBlockerFn,
  condition?: boolean | any,
): BlockerResolver {
  const {
    shouldBlockFn,
    to,
    toMatchOpts,

    from,
    fromMatchOpts,

    enableBeforeUnload = true,
    disabled = false,
    withResolver = false,
  } = _resolveBlockerOpts(opts, condition)

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

      const shouldBlock = await shouldBlockFn(blockerFnArgs)
      if (!withResolver) return shouldBlock

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
  }, [
    shouldBlockFn,
    enableBeforeUnload,
    disabled,
    withResolver,
    history,
    from,
    to,
  ])

  return resolver
}

const _resolvePromptBlockerArgs = (
  props: PromptProps | LegacyPromptProps,
): UseBlockerOpts => {
  if ('shouldBlockFn' in props) return { ...props }

  const shouldBlock = Boolean(props.condition ?? true)
  const fn = props.blockerFn

  const _customBlockerFn: BlockerFn = async () => {
    if (shouldBlock && fn !== undefined) return await fn()
    return shouldBlock
  }

  return {
    shouldBlockFn: _customBlockerFn,
    enableBeforeUnload: shouldBlock,
    withResolver: fn === undefined,
  }
}

/**
 *  @deprecated Use the shouldBlockFn property instead
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
