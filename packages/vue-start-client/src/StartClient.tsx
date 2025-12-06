import * as Vue from 'vue'
import { RouterProvider } from '@tanstack/vue-router'
import type { AnyRouter } from '@tanstack/router-core'

export const StartClient = Vue.defineComponent({
  name: 'StartClient',
  props: {
    router: {
      type: Object as () => AnyRouter,
      required: true,
    },
  },
  setup(props) {
    return () => Vue.h(RouterProvider, { router: props.router })
  },
})
