import {
  defaultGetScrollRestorationKey,
  restoreScroll,
  storageKey,
} from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { ScriptOnce } from './ScriptOnce'

export function ScrollRestoration() {
  const router = useRouter()
  const getKey =
    router.options.getScrollRestorationKey || defaultGetScrollRestorationKey
  const userKey = getKey(router.latestLocation)
  const resolvedKey =
    userKey !== defaultGetScrollRestorationKey(router.latestLocation)
      ? userKey
      : undefined

  if (!router.isScrollRestoring || !router.isServer) {
    return null
  }

  const restoreScrollOptions: Parameters<typeof restoreScroll>[0] = {
    storageKey,
    shouldScrollRestoration: true,
  }
  if (resolvedKey) {
    restoreScrollOptions.key = resolvedKey
  }

  return (
    <ScriptOnce
      children={`(${restoreScroll.toString()})(${JSON.stringify(restoreScrollOptions)})`}
    />
  )
}
