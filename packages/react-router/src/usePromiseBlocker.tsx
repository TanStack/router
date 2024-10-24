import * as React from 'react'
import { useRouter } from './useRouter'
import { matchPathname } from './path'
import type { BlockerFnArgs } from '@tanstack/history'
import type { UseBlockerOpts } from './useBlocker'

export function usePromiseBlocker({
  blockerFn,
  to,
  toMatchOpts,
  from,
  fromMatchOpts,
  disableBeforeUnload = false,
  disabled = false,
}: UseBlockerOpts) {
  const router = useRouter()
  const { history } = router

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
      if (shouldBlock) return true

      return false
    }

    const blocker = {
      blockerFn: blockerFnComposed,
      disableBeforeUnload,
    }

    return disabled ? undefined : history.block(blocker)
  }, [blockerFn, disableBeforeUnload, disabled, history])
}
