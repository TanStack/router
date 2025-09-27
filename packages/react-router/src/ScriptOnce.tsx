import { useRouter } from './useRouter'

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
