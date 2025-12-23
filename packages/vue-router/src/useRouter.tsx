import * as Vue from 'vue'
import warning from 'tiny-warning'
import { getRouterContext } from './routerContext'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
} from '@tanstack/router-core'

export function useRouter<
  TRegister extends Register = Register,
>(opts?: { warn?: boolean }): RegisteredRouter<TRegister> {
  const value = Vue.inject(getRouterContext() as any, null)
  warning(
    !((opts?.warn ?? true) && !value),
    'useRouter must be used inside a <RouterProvider> component!',
  )
  return value as any
}
