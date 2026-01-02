import type {
  AnyRouter,
  FromPathOption,
  NavigateOptions,
  RegisteredRouter,
  UseNavigateResult,
} from '@tanstack/router-core'
import { injectRouter } from './injectRouter'

export function injectNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(_defaultOpts?: {
  from?: FromPathOption<TRouter, TDefaultFrom>
}): UseNavigateResult<TDefaultFrom> {
  const router = injectRouter()

  return ((options: NavigateOptions) => {
    return router.navigate({
      ...options,
      from: options.from ?? _defaultOpts?.from,
    })
  }) as UseNavigateResult<TDefaultFrom>
}

export type InjectNavigateResult<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
> = UseNavigateResult<TDefaultFrom>
