import { useMatch } from './useMatch'
import type { Handle } from '@remix-run/ui'
import type {
  AnyRouter,
  RegisteredRouter,
  UseRouteContextOptions,
  UseRouteContextResult,
} from '@tanstack/router-core'

/**
 * Subscribe to a route's resolved context (the merged result of route +
 * beforeLoad context).
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useRouteContextHook
 */
export function useRouteContext<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  handle: Handle<any, any>,
  opts: UseRouteContextOptions<TRouter, TFrom, TStrict, TSelected>,
): () => UseRouteContextResult<TRouter, TFrom, TStrict, TSelected> {
  return useMatch(handle, {
    ...(opts as any),
    select: (match: any) =>
      opts.select ? opts.select(match.context) : match.context,
  }) as any
}
