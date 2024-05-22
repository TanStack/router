import * as React from 'react'
import { useRouter } from './useRouter'
import type { BlockerFn } from '@tanstack/history'
import type { ReactNode } from './route'

type BlockerResolver = {
  status: 'idle' | 'blocked'
  proceed: () => void
  reset: () => void
}

export function useBlocker(opts?: {
  blockerFn?: BlockerFn
  condition: boolean | any
}) {
  const condition = opts?.condition ?? true
  const { history } = useRouter()

  const [resolver, setResolver] = React.useState<BlockerResolver>({
    status: 'idle',
    proceed: () => {},
    reset: () => {},
  })

  const createPromise = () =>
    new Promise<boolean>((resolve) => {
      setResolver({
        status: 'idle',
        proceed: () => resolve(true),
        reset: () => resolve(false),
      })
    })

  const [promise, setPromise] = React.useState(createPromise)

  React.useEffect(() => {
    const blockerFnComposed = async () => {
      const canNavigateSync = opts?.blockerFn?.()

      if (canNavigateSync) return true

      setResolver((prev) => ({
        ...prev,
        status: 'blocked',
      }))
      const canNavigateAsync = await promise

      setPromise(createPromise)

      return canNavigateAsync
    }

    return !condition ? undefined : history.block(blockerFnComposed)
  }, [opts?.blockerFn, condition, history, promise, opts])

  return resolver
}

export function Block({ blockerFn, condition, children }: PromptProps) {
  const resolver = useBlocker({ blockerFn, condition })
  return children
    ? typeof children === 'function'
      ? children(resolver)
      : children
    : null
}

export type PromptProps = {
  blockerFn?: BlockerFn
  condition?: boolean | any
  children?: ReactNode | (({ proceed, reset }: BlockerResolver) => ReactNode)
}
