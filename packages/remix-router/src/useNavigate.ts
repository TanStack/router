import { useRouter } from './useRouter'
import type { Handle } from '@remix-run/ui'
import type {
  AnyRouter,
  FromPathOption,
  NavigateOptions,
  RegisteredRouter,
  UseNavigateResult,
} from '@tanstack/router-core'

/**
 * Returns an imperative `navigate(options)` function bound to the current
 * router. Mirrors `useNavigate` from `@tanstack/react-router` — same options,
 * same return shape, just takes the component `handle` as the first arg.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useNavigateHook
 */
export function useNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(
  handle: Handle<any, any>,
  defaultOpts?: { from?: FromPathOption<TRouter, TDefaultFrom> },
): UseNavigateResult<TDefaultFrom> {
  const router = useRouter(handle)
  const navigate = (options: NavigateOptions) =>
    router.navigate({
      ...options,
      from: options.from ?? defaultOpts?.from,
    })
  return navigate as UseNavigateResult<TDefaultFrom>
}
