import * as Vue from 'vue'
import { isNotFound } from '@tanstack/router-core'
import { useSelector } from './useSelector'
import { CatchBoundary } from './CatchBoundary'
import { useRouter } from './useRouter'
import type { ErrorComponentProps, NotFoundError } from '@tanstack/router-core'

type CatchNotFoundProps = {
  fallback?: (error: NotFoundError) => Vue.VNode
  onCatch?: (error: Error) => void
  children: Vue.VNode
}

const CatchNotFoundImpl = Vue.defineComponent({
  name: 'CatchNotFound',
  props: {
    fallback: Function as Vue.PropType<(error: NotFoundError) => Vue.VNode>,
    onCatch: Function as Vue.PropType<(error: Error) => void>,
    children: {
      type: Object as Vue.PropType<Vue.VNode>,
      required: true,
    },
  },
  setup(props) {
    const router = useRouter()
    // TODO: Some way for the user to programmatically reset the not-found boundary?
    const pathname = useSelector(
      router.stores.location,
      (location) => location.pathname,
    )
    const status = useSelector(router.stores.status)

    return () =>
      Vue.h(CatchBoundary, {
        getResetKey: () => `not-found-${pathname.value}-${status.value}`,
        onCatch: (error: Error) => {
          if (isNotFound(error)) {
            props.onCatch?.(error)
          } else {
            throw error
          }
        },
        errorComponent: ({ error }: ErrorComponentProps) => {
          if (isNotFound(error)) {
            return props.fallback?.(error) ?? Vue.h('p', null, 'Not Found')
          } else {
            throw error
          }
        },
        children: props.children,
      })
  },
})

export function CatchNotFound(props: CatchNotFoundProps) {
  return Vue.h(CatchNotFoundImpl, props)
}

export const DefaultGlobalNotFound = Vue.defineComponent({
  name: 'DefaultGlobalNotFound',
  setup() {
    return () => Vue.h('p', null, 'Not Found')
  },
})
