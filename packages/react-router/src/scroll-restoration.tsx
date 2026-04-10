import * as React from 'react'
import { getScrollRestorationScriptForRouter } from '@tanstack/router-core/scroll-restoration-script'
import { useRouter } from './useRouter'
import { ScriptOnce } from './ScriptOnce'

export function ScrollRestoration(): React.JSX.Element | null {
  const router = useRouter()
  const script = getScrollRestorationScriptForRouter(router)

  if (!script) {
    return null
  }

  return <ScriptOnce children={script} />
}
