import * as Vue from 'vue'
import { _assertPendingRouteContextAccess } from '@tanstack/router-core'
import { nonRouteComponentContext } from './nonRouteComponentContext'
import { useMatch } from './useMatch'
import type {
  AnyRouter,
  RegisteredRouter,
  UseRouteContextBaseOptions,
  UseRouteContextOptions,
  UseRouteContextResult,
} from '@tanstack/router-core'

export type UseRouteContextRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseRouteContextBaseOptions<TRouter, TFrom, true, TSelected>,
) => Vue.Ref<UseRouteContextResult<TRouter, TFrom, true, TSelected>>

export function useRouteContext<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseRouteContextOptions<TRouter, TFrom, TStrict, TSelected>,
): Vue.Ref<UseRouteContextResult<TRouter, TFrom, TStrict, TSelected>> {
  const nonRouteComponent =
    process.env.NODE_ENV !== 'production'
      ? Vue.inject(nonRouteComponentContext!, undefined)
      : undefined

  if (process.env.NODE_ENV !== 'production') {
    if (nonRouteComponent?.value.component === 'pendingComponent') {
      _assertPendingRouteContextAccess(nonRouteComponent.value.route, opts.from)
    }
  }

  return useMatch({
    ...opts,
    select: (match) => {
      if (process.env.NODE_ENV !== 'production') {
        if (nonRouteComponent?.value.component === 'pendingComponent') {
          _assertPendingRouteContextAccess(
            nonRouteComponent.value.route,
            opts.from,
          )
        }
      }
      return opts.select ? opts.select(match.context) : match.context
    },
  }) as any
}
