import * as Solid from 'solid-js'
import { useRouter } from './useRouter'
import type {
  FromPathOption,
  NavigateOptions,
  Register,
  RegisteredRouter,
  UseNavigateResult,
} from '@tanstack/router-core'

export function useNavigate<
  TRegister extends Register = Register,
  TDefaultFrom extends string = string,
>(_defaultOpts?: {
  from?: FromPathOption<RegisteredRouter<TRegister>, TDefaultFrom>
}): UseNavigateResult<TRegister, TDefaultFrom> {
  const router = useRouter()

  return ((options: NavigateOptions) => {
    return router.navigate({
      ...options,
      from: options.from ?? _defaultOpts?.from,
    })
  }) as UseNavigateResult<TRegister, TDefaultFrom>
}

export function Navigate<
  TRegister extends Register = Register,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  props: NavigateOptions<
    RegisteredRouter<TRegister>,
    TFrom,
    TTo,
    TMaskFrom,
    TMaskTo
  >,
): null {
  const { navigate } = useRouter()

  Solid.onMount(() => {
    navigate({
      ...props,
    })
  })

  return null
}
