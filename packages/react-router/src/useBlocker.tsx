import * as React from 'react'
import { useRouter } from './useRouter'
import type { BlockerFn } from '@tanstack/history'
import type { ReactNode } from './route'

type BlockerResolver = {
  proceed: () => void
  reset: () => void
}

export function useBlocker(
  blockerFn: BlockerFn,
  condition: boolean | any = true,
) {
  const { history } = useRouter()

  const [resolver, setResolver] = React.useState<BlockerResolver>({
    proceed: () => {},
    reset: () => {},
  })

  const createPromise = () =>
    new Promise<boolean>((resolve) => {
      setResolver({
        proceed: () => resolve(true),
        reset: () => resolve(false),
      })
    })

  const [promise, setPromise] = React.useState(createPromise)

  React.useEffect(() => {
    const blockerFnComposed = async () => {
      const canNavigateSync = blockerFn()

      if (canNavigateSync) return true

      const canNavigateAsync = await promise

      setPromise(createPromise)

      return canNavigateAsync
    }

    return !condition ? undefined : history.block(blockerFnComposed)
  }, [blockerFn, condition, history, promise])

  return resolver
}

export function Block({ blocker, condition, children }: PromptProps) {
  const resolver = useBlocker(blocker, condition)
  return children
    ? typeof children === 'function'
      ? children(resolver)
      : children
    : null
}

export type PromptProps = {
  blocker: BlockerFn
  condition?: boolean | any
  children?: ReactNode | (({ proceed, reset }: BlockerResolver) => ReactNode)
}
