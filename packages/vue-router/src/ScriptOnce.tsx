import * as Vue from 'vue'
import { useRouter } from './useRouter'

export const ScriptOnce = Vue.defineComponent({
  name: 'ScriptOnce',
  props: {
    children: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const router = useRouter()

    if (router.isServer) {
      return () => (
        <script
          nonce={router.options.ssr?.nonce}
          class="$tsr"
          innerHTML={props.children}
        />
      )
    }

    const mounted = Vue.ref(false)
    Vue.onMounted(() => {
      mounted.value = true
    })

    return () => {
      if (mounted.value) {
        return null
      }

      return (
        <script
          nonce={router.options.ssr?.nonce}
          class="$tsr"
          data-allow-mismatch
          innerHTML=""
        />
      )
    }
  },
})
