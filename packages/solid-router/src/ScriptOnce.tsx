import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'

import type { JSX } from 'solid-js'

export function ScriptOnce({
  children,
}: {
  children: string
  log?: boolean
  sync?: boolean
}): JSX.Element | null {
  const router = useRouter()
  if (!(isServer ?? router.isServer)) {
    return null
  }
  return (
    <script
      nonce={router.options.ssr?.nonce}
      class="$tsr"
      innerHTML={children + ';document.currentScript.remove()'}
    />
  )
}
