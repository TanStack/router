import * as Vue from 'vue'
import { RouterProvider } from '@tanstack/vue-router'
import type { AnyRouter } from '@tanstack/router-core'

declare global {
  interface Window {
    $_TSR?: {
      cleanup?: () => void
      [key: string]: unknown
    }
  }
}

export const StartClient = Vue.defineComponent({
  name: 'StartClient',
  props: {
    router: {
      type: Object as () => AnyRouter,
      required: true,
    },
  },
  setup(props) {
    // After Vue hydration is complete, trigger cleanup of $tsr scripts
    // Use nextTick to ensure all child component onMounted hooks have completed
    // This prevents removing scripts before components have finished transitioning
    Vue.onMounted(() => {
      Vue.nextTick(() => {
        window.$_TSR?.cleanup?.()
      })
    })

    return () => <RouterProvider router={props.router} />
  },
})
