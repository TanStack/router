import { isServer } from '@tanstack/router-core'
import { useRouter } from './useRouter'

export function ScriptOnce({
  children,
}: {
  children: string
  log?: boolean
  sync?: boolean
}) {
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
