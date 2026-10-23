import * as Vue from 'vue'
import { useRouter } from './useRouter'
import type { SubscriberArgs } from '@tanstack/history'

export interface BlockerState {
  status: 'idle' | 'blocked'
  /** Allow the currently blocked navigation to proceed. */
  proceed: () => void
  /** Keep the currently blocked navigation blocked (cancels the navigation). */
  reset: () => void
  /** Allow the blocked navigation to proceed, skipping any remaining blockers. */
  proceedAll: () => void
}

const noop = () => {}

const createIdleState = (): BlockerState => ({
  status: 'idle',
  proceed: noop,
  reset: noop,
  proceedAll: noop,
})

export function useBlockerState(): Vue.DeepReadonly<Vue.Ref<BlockerState>> {
  const router = useRouter()
  const state = Vue.ref<BlockerState>(createIdleState())

  Vue.watchEffect((onCleanup) => {
    const unsubscribe = router.history.subscribe((event: SubscriberArgs) => {
      if (event.action.type === 'BLOCK') {
        const { proceed, reset, proceedAll } = event.action
        state.value = { status: 'blocked', proceed, reset, proceedAll }
      } else if (event.action.type === 'DISMISS_BLOCK') {
        state.value = createIdleState()
      }
    })

    onCleanup(unsubscribe)
  })

  return Vue.readonly(state)
}
