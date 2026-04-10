import { useStore } from '@tanstack/vue-store'
import { useRouter } from './useRouter'
import type { Ref } from 'vue'

export function useCanGoBack(): Readonly<Ref<boolean>> {
  const router = useRouter()
  return useStore(
    router.stores.location,
    (location) => location.state.__TSR_index !== 0,
  )
}
