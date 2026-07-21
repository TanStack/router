import { useStore } from '@tanstack/react-store'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import { useRouterStateSnapshotStore } from './routerStateSnapshot'

export function useCanGoBack() {
  const router = useRouter()
  const snapshotStore = useRouterStateSnapshotStore(router)

  if (isServer ?? router.isServer) {
    const location = snapshotStore
      ? snapshotStore.get().location
      : router.stores.location.get()
    return location.state.__TSR_index !== 0
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  return useStore(
    (snapshotStore ?? router.stores.location) as any,
    (value: any) =>
      (snapshotStore ? value.location : value).state.__TSR_index !== 0,
  )
}
