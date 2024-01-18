import { useStore } from '@tanstack/react-store'
import { AnyRoute } from './route'
import { RegisteredRouter, Router, RouterState } from './router'
import { useRouter } from './useRouter'

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
