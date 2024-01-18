import * as React from 'react'
import { ReactNode } from './route'
import { useRouter } from './useRouter'
import { BlockerFn } from '@tanstack/history'

export function useBlocker(
  blockerFn: BlockerFn,
  condition: boolean | any = true,
): void {
  const { history } = useRouter()

  React.useEffect(() => {
    if (!condition) return
    return history.block(blockerFn)
  })
}

export function Block({ blocker, condition, children }: PromptProps) {
  useBlocker(blocker, condition)
  return (children ?? null) as ReactNode
}

export type PromptProps = {
  blocker: BlockerFn
  condition?: boolean | any
  children?: ReactNode
}
