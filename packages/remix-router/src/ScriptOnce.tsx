/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { useRouter } from './useRouter'
import type { Handle, RemixNode } from '@remix-run/ui'

const isServer = typeof document === 'undefined'

export interface ScriptOnceProps {
  children: string
}

/**
 * Server-only helper: emits an inline `<script>` exactly once during SSR
 * and removes itself on client load. No-op on the client.
 */
export function ScriptOnce(handle: Handle<ScriptOnceProps>) {
  const router = useRouter(handle)
  return ({ children }: ScriptOnceProps): RemixNode => {
    if (!isServer && !router.isServer) return null
    const nonce = router.options.ssr?.nonce
    return (
      <script
        nonce={nonce}
        innerHTML={children + ';document.currentScript.remove()'}
      />
    )
  }
}
