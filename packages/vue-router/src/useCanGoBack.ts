import { useSelector } from '@tanstack/vue-store'
import { isServer } from '@tanstack/router-core/isServer'
import * as Vue from 'vue'
import { useRouter } from './useRouter'

export function useCanGoBack() {
  const router = useRouter()
  if (isServer ?? router.isServer) {
    return Vue.toRef(() => router.stores.location.get().state.__TSR_index !== 0)
  }
  return useSelector(
    router.stores.location,
    (location) => location.state.__TSR_index !== 0,
  )
}
