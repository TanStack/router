import { useMatch } from './useMatch'
import type { AnyRouter, RegisteredRouter } from './router'
import type {
  UseRouteContextOptions,
  UseRouteContextResult,
} from '@tanstack/router-core'

export function useRouteContext<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseRouteContextOptions<TRouter, TFrom, TStrict, TSelected>,
): UseRouteContextResult<TRouter, TFrom, TStrict, TSelected> {
  return useMatch({
    ...(opts as any),
    select: (match) =>
      opts.select ? opts.select(match.context) : match.context,
  }) as UseRouteContextResult<TRouter, TFrom, TStrict, TSelected>
}
