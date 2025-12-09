import * as Vue from 'vue'
import { isNotFound } from '@tanstack/router-core'
import { CatchBoundary } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import type { ErrorComponentProps, NotFoundError } from '@tanstack/router-core'

export function CatchNotFound(props: {
  fallback?: (error: NotFoundError) => Vue.VNode
  onCatch?: (error: Error) => void
  children: Vue.VNode
}) {
  // TODO: Some way for the user to programmatically reset the not-found boundary?
  const resetKey = useRouterState({
    select: (s) => `not-found-${s.location.pathname}-${s.status}`,
  })

  // Create a function that returns a VNode to match the SyncRouteComponent signature
  const errorComponentFn = (componentProps: ErrorComponentProps) => {
    const error = componentProps.error

    if (isNotFound(error)) {
      // If a fallback is provided, use it
      if (props.fallback) {
        return props.fallback(error as NotFoundError)
      }
      // Otherwise return a default not found message
      return Vue.h('p', null, 'Not Found')
    } else {
      // Re-throw non-NotFound errors
      throw error
    }
  }

  return Vue.h(CatchBoundary, {
    getResetKey: () => resetKey.value,
    onCatch: (error: Error) => {
      if (isNotFound(error)) {
        if (props.onCatch) {
          props.onCatch(error)
        }
      } else {
        throw error
      }
    },
    errorComponent: errorComponentFn,
    children: props.children,
  })
}

export const DefaultGlobalNotFound = Vue.defineComponent({
  name: 'DefaultGlobalNotFound',
  setup() {
    return () => Vue.h('p', null, 'Not Found')
  },
})
