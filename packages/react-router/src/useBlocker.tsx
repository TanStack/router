import * as React from 'react'
import { useRouter } from './useRouter'
import type { BlockerFn } from '@tanstack/history'
import type { ReactNode } from './route'

type BlockerResolver = {
  status: 'idle' | 'blocked'
  proceed: () => void
  reset: () => void
}

type BlockerOpts = {
  blockerFn?: BlockerFn
  condition?: boolean | any
}

export function useBlocker(
  blockerFnOrOpts?: BlockerFn | BlockerOpts,
  condition?: boolean | any,
) {
  const { blockerFn, blockerCondition } = blockerFnOrOpts
    ? typeof blockerFnOrOpts === 'function'
      ? { blockerFn: blockerFnOrOpts, blockerCondition: condition ?? true }
      : {
          blockerFn: blockerFnOrOpts.blockerFn,
          blockerCondition: blockerFnOrOpts.condition ?? true,
        }
    : { blockerFn: undefined, blockerCondition: true }
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
      const canNavigateSync = blockerFn?.()

      if (canNavigateSync) return true

      setResolver((prev) => ({
        ...prev,
        status: 'blocked',
      }))
      const canNavigateAsync = await promise

      setPromise(createPromise)

      return canNavigateAsync
    }

    return !blockerCondition ? undefined : history.block(blockerFnComposed)
  }, [blockerFn, blockerCondition, history, promise])

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
