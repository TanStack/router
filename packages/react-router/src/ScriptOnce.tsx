import { useRouter } from './useRouter'

export function ScriptOnce({
  children,
  log,
}: {
  children: string
  log?: boolean
}) {
  const router = useRouter()

  router.injectScript(children, { logScript: log })
  return null
}
