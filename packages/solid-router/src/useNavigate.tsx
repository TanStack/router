import * as Solid from 'solid-js'
import { useRouter } from './useRouter'
import { useMatch } from './useMatch'
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

  const matchIndex = useMatch({
    strict: false,
    select: (match) => match.index,
  })

  return ((options: NavigateOptions) => {
    const currentRouteMatches = router.matchRoutes(router.latestLocation, {
      _buildLocation: false,
    })

    return router.navigate({
      ...options,
      from:
        options.from ??
        _defaultOpts?.from ??
        currentRouteMatches.slice(-1)[0]?.fullPath ??
        router.state.matches[matchIndex()]!.fullPath,
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
