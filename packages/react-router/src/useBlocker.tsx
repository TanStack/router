import * as React from 'react'
import { useRouter } from './useRouter'
import type { BlockerFn } from '@tanstack/history'
import type { ReactNode } from './route'

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
  return children ?? null
}

export type PromptProps = {
  blocker: BlockerFn
  condition?: boolean | any
  children?: ReactNode
}
