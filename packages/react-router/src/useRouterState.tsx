import { useStore } from '@tanstack/react-store'
import { useRouter } from './useRouter'
import type { AnyRouter, RegisteredRouter, Router, RouterState } from './router'

export function useRouterState<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = RouterState<TRouter['routeTree']>,
>(opts?: {
  router?: TRouter
  select: (state: RouterState<RegisteredRouter['routeTree']>) => TSelected
}): TSelected {
  const contextRouter = useRouter<TRouter>({
    warn: opts?.router === undefined,
  })
  return useStore((opts?.router || contextRouter).__store, opts?.select as any)
}
