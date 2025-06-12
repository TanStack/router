import React from 'react'
import { useRouter } from './useRouter'
import type { RouterHistory } from '@tanstack/history'

type BlockerState = {
  status: 'idle' | 'blocked'
  reset: () => void
  proceed: () => void
  proceedAll: () => void
}

const initialState = () =>
  ({
    status: 'idle',
    reset: () => {},
    proceed: () => {},
    proceedAll: () => {},
  }) as const

export const useNavigationBlockingState = () => {
  const { history } = useRouter()
  const [state, setState] = React.useState<BlockerState>(initialState)

  React.useEffect(() => {
    if (!history) {
      return
    }
    const unsubscribe = (history as RouterHistory).subscribe((event) => {
      if (event.action.type === 'BLOCK') {
        const { proceed, proceedAll, reset } = event.action
        setState({
          status: 'blocked',
          proceed,
          proceedAll,
          reset,
        })
        return
      }

      if (event.action.type === 'DISMISS_BLOCK') {
        setState(initialState())
      }
    })

    return () => {
      unsubscribe()
    }
  }, [history])

  return state
}
