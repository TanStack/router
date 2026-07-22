import * as React from 'react'
import { useRouter } from '@tanstack/react-router/native'
import type {
  AnyRouter,
  FromPathOption,
  NavigateOptions,
  RegisteredRouter,
  UseNavigateResult,
} from '@tanstack/router-core'

/** Navigate with NativeScript stack defaults and route identity. */
export function useNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(_defaultOptions?: {
  from?: FromPathOption<TRouter, TDefaultFrom>
}): UseNavigateResult<TDefaultFrom> {
  const router = useRouter()

  return React.useCallback(
    (options: NavigateOptions) => {
      return router.navigate({
        ...options,
        from: options.from ?? _defaultOptions?.from,
      })
    },
    [_defaultOptions?.from, router],
  ) as UseNavigateResult<TDefaultFrom>
}

/** Navigate after this component mounts. */
export function Navigate<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(props: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): null {
  const navigate = useNavigate()
  const previousPropsRef = React.useRef<typeof props | null>(null)

  React.useLayoutEffect(() => {
    if (previousPropsRef.current !== props) {
      void navigate(props)
      previousPropsRef.current = props
    }
  }, [navigate, props])

  return null
}
