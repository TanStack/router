import { getScrollRestorationScriptForRouter } from '@tanstack/router-core/scroll-restoration-script'
import { useRouter } from './useRouter'
import { ScriptOnce } from './ScriptOnce'

import type { JSX } from 'solid-js'

export function ScrollRestoration(): JSX.Element | null {
  const router = useRouter()
  const script = getScrollRestorationScriptForRouter(router)

  if (!script) {
    return null
  }

  return <ScriptOnce children={script} />
}
