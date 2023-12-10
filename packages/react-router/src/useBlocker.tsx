import * as React from 'react'
import { ReactNode } from './route'
import { useRouter } from './RouterProvider'

export function useBlocker(
  message: string,
  condition: boolean | any = true,
): void {
  const { history } = useRouter()

  React.useEffect(() => {
    if (!condition) return
    return history.block(message)
  })
}

export function Block({ message, condition, children }: PromptProps) {
  useBlocker(message, condition)
  return (children ?? null) as ReactNode
}

export type PromptProps = {
  message: string
  condition?: boolean | any
  children?: ReactNode
}
