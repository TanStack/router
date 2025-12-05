import { useRouter } from './useRouter'

/**
 * Server-only helper to emit a script tag exactly once during SSR.
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
        __html: children + ';typeof $_TSR !== "undefined" && $_TSR.c()',
      }}
    />
  )
}
