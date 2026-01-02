import { injectMatch } from './injectMatch'
import type { Signal } from '@angular/core'
import type {
  AnyRouter,
  RegisteredRouter,
  UseRouteContextBaseOptions,
  UseRouteContextOptions,
  UseRouteContextResult,
} from '@tanstack/router-core'

export type InjectRouteContextRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseRouteContextBaseOptions<TRouter, TFrom, true, TSelected>,
) => Signal<UseRouteContextResult<TRouter, TFrom, true, TSelected>>

export function injectRouterContext<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseRouteContextOptions<TRouter, TFrom, TStrict, TSelected>,
): Signal<UseRouteContextResult<TRouter, TFrom, TStrict, TSelected>> {
  return injectMatch({
    ...opts,
    select: (match) =>
      opts.select ? opts.select(match.context) : match.context,
  }) as any
}
