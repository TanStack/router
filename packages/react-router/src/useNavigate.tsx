import * as React from 'react'
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
  const { navigate, state } = useRouter()

  // Just get the index of the current match to avoid rerenders
  // as much as possible
  const matchIndex = useMatch({
    strict: false,
    select: (match) => match.index,
  })

  return React.useCallback(
    (options: NavigateOptions) => {
      const from =
        options.from ??
        _defaultOpts?.from ??
        state.matches[matchIndex]!.fullPath

      return navigate({
        ...options,
        from,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [router, props, navigate])
  return null
}
