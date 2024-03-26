import { useStore } from '@tanstack/react-store'
import { useRouter } from './useRouter'
import type { AnyRoute } from './route'
import type { RegisteredRouter, Router, RouterState } from './router'

export function useRouterState<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TSelected = RouterState<TRouteTree>,
>(opts?: {
  router?: Router<TRouteTree>
  select: (state: RouterState<RegisteredRouter['routeTree']>) => TSelected
}): TSelected {
  const contextRouter = useRouter<TRouteTree>({
    warn: opts?.router === undefined,
  })
  return useStore((opts?.router || contextRouter).__store, opts?.select as any)
}
