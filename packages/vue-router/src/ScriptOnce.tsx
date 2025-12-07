import * as Vue from 'vue'
import { useRouter } from './useRouter'

/**
 * Server-only helper to emit a script tag exactly once during SSR.
 *
 * On the server: renders a script with the provided children.
 * On the client during hydration: renders a matching script element to avoid hydration mismatch.
 * After mount: renders nothing (the script has already executed).
 *
 * Unlike React's version, Vue's ScriptOnce does NOT call $_TSR.c() inline
 * because Vue doesn't have suppressHydrationWarning. The cleanup is deferred
 * until after Vue hydration completes (called from StartClient).
 */
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

    // Server-side: render the script with actual content
    if (router.isServer) {
      return () => (
        <script
          nonce={router.options.ssr?.nonce}
          class="$tsr"
          innerHTML={props.children}
        />
      )
    }

    // Client-side: track mounted state
    const mounted = Vue.ref(false)
    Vue.onMounted(() => {
      mounted.value = true
    })

    return () => {
      // After mount, render nothing - script already executed and will be cleaned up
      if (mounted.value) {
        return null
      }

      // During hydration: render a script element to match the server-rendered one
      // The content will mismatch but data-allow-mismatch suppresses the warning
      // The script element itself must exist to avoid node type mismatch
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
