import * as Solid from 'solid-js'
import warning from 'tiny-warning'
import { getRouterContext } from './routerContext'
import type { Register, RegisteredRouter } from '@tanstack/router-core'

export function useRouter<TRegister extends Register = Register>(opts?: {
  warn?: boolean
}): RegisteredRouter<TRegister> {
  const value = Solid.useContext(getRouterContext() as any)
  warning(
    !((opts?.warn ?? true) && !value),
    'useRouter must be used inside a <RouterProvider> component!',
  )
  return value as any
}
