import * as React from 'react'
import { useRouter } from './useRouter'
import { useMatch } from './useMatch'
import { useMatches } from './Matches'
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
  const { navigate } = useRouter()

  // when `from` is not supplied, use the nearest parent match's full path as the `from` location
  // so relative routing works as expected
  const nearestFrom = useMatch({
    strict: false,
    select: (match) => match.fullPath,
  })

  const leafFrom = useMatches({
    select: (matches) => matches[matches.length - 1]!.fullPath,
  })

  return React.useCallback(
    (options: NavigateOptions) => {
      const from =
        (options.from ?? _defaultOpts?.from ?? 
        (options.relative === 'path'
          ? leafFrom: nearestFrom))

      return navigate({
        ...options,
        from: from as any,
      })
    },
    [_defaultOpts?.from, navigate],
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
  }, [router, props])
  return null
}
