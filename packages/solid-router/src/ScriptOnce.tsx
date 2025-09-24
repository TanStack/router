import { useRouter } from './useRouter'

export function ScriptOnce({
  children,
}: {
  children: string
  log?: boolean
  sync?: boolean
}) {
  const router = useRouter()
  if (!router.isServer) {
    return null
  }
  return (
    <script
      nonce={router.options.ssr?.nonce}
      class="$tsr"
      innerHTML={[children].filter(Boolean).join('\n') + ';$_TSR.c()'}
    />
  )
}
