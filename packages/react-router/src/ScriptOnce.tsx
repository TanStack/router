import { useRouter } from './useRouter'

/**
 * SSR-only utility component to emit a single inline script once per request.
 * Appends an internal callback marker to signal SSR completion.
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
