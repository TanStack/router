import * as Vue from 'vue'
import { getScrollRestorationScriptForRouter } from '@tanstack/router-core/scroll-restoration-script'
import { useRouter } from './useRouter'
import { ScriptOnce } from './ScriptOnce'

export const ScrollRestoration: new (...args: Array<any>) => any = Vue.defineComponent({
  name: 'ScrollRestoration',
  setup(): () => Vue.VNode | null {
    const router = useRouter()

    return () => {
      const script = getScrollRestorationScriptForRouter(router)

      if (script) {
        return Vue.h(ScriptOnce, { children: script })
      }

      return null
    }
  },
})
