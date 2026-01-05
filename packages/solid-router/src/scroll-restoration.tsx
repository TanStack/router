import {
  defaultGetScrollRestorationKey,
  restoreScroll,
  storageKey,
} from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { ScriptOnce } from './ScriptOnce'

export function ScrollRestoration() {
  const router = useRouter()
  if (!router.isScrollRestoring || !router.isServer) {
    return null
  }
  if (typeof router.options.scrollRestoration === 'function') {
    const shouldRestore = router.options.scrollRestoration({
      location: router.latestLocation,
    })
    if (!shouldRestore) {
      return null
    }
  }
  const getKey =
    router.options.getScrollRestorationKey || defaultGetScrollRestorationKey
  const userKey = getKey(router.latestLocation)
  const resolvedKey =
    userKey !== defaultGetScrollRestorationKey(router.latestLocation)
      ? userKey
      : undefined

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
