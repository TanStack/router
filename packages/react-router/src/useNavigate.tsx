import * as React from 'react'
import { last } from '@tanstack/router-core'
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

  return React.useCallback(
    (options: NavigateOptions) => {
      const activeLocationMatches = router.matchRoutes(router.latestLocation, {
        _buildLocation: false,
      })

      const activeLocationMatch = last(activeLocationMatches)

      const from =
        options.from ??
        _defaultOpts?.from ??
        activeLocationMatch?.fullPath ??
        router.state.matches[matchIndex]!.fullPath

      return router.navigate({
        ...options,
        from,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [_defaultOpts?.from, router],
  ) as UseNavigateResult<TDefaultFrom>
}

export function Navigate<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(props: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): null {
  const router = useRouter()
  const navigate = useNavigate()

  const previousPropsRef = React.useRef<NavigateOptions<
    TRouter,
    TFrom,
    TTo,
    TMaskFrom,
    TMaskTo
  > | null>(null)
  React.useEffect(() => {
    if (previousPropsRef.current !== props) {
      navigate(props)
      previousPropsRef.current = props
    }
  }, [router, props, navigate])
  return null
}
