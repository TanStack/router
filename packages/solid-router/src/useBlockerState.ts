import * as Solid from 'solid-js'
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

export function useBlockerState(): Solid.Accessor<BlockerState> {
  const router = useRouter()
  const [state, setState] = Solid.createSignal<BlockerState>(createIdleState())

  Solid.createEffect(() => {
    const unsubscribe = router.history.subscribe((event: SubscriberArgs) => {
      if (event.action.type === 'BLOCK') {
        const { proceed, reset, proceedAll } = event.action
        setState({ status: 'blocked', proceed, reset, proceedAll })
      } else if (event.action.type === 'DISMISS_BLOCK') {
        setState(createIdleState())
      }
    })

    Solid.onCleanup(unsubscribe)
  })

  return state
}
