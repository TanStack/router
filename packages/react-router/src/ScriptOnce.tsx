import { useRouter } from './useRouter'

/**
 * Server-only helper to emit a script tag exactly once during SSR.
 * Appends an internal marker to signal hydration completion.
 */
export function ScriptOnce({ children }: { children: string }) {
  const router = useRouter()
  if (!router.isServer) {
    return null
  }

  return (
    <script
      nonce={router.options.ssr?.nonce}
      className="$tsr"
      dangerouslySetInnerHTML={{
        __html: [children].filter(Boolean).join('\n') + ';$_TSR.c()',
      }}
    />
  )
}
