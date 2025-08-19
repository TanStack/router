import * as Solid from 'solid-js'
import { useRouter } from './useRouter'
import { useActiveLocation } from './useActiveLocation'
import type {
  AnyRouter,
  FromPathOption,
  NavigateOptions,
  RegisteredRouter,
  UseNavigateResult,
} from '@tanstack/router-core'

export function useNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(_defaultOpts?: {
  from?: FromPathOption<TRouter, TDefaultFrom>
}): UseNavigateResult<TDefaultFrom> {
  const router = useRouter()

  const {getFromPath} = useActiveLocation()
  return ((options: NavigateOptions) => {
    const from  = getFromPath(options.from ?? _defaultOpts?.from)

    return router.navigate({
      ...options,
      from: from()
    })
  }) as UseNavigateResult<TDefaultFrom>
}

export function Navigate<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(props: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): null {
  const { navigate } = useRouter()

  Solid.onMount(() => {
    navigate({
      ...props,
    })
  })

  return null
}
