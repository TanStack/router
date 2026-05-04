/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { Match } from './Match'
import { useRouter } from './useRouter'
import { getMatchId } from './MatchContext'
import { subscribeStore } from './subscribe'
import type { Handle, RemixNode } from '@remix-run/ui'

/**
 * Render the next child match in the route tree. Used inside a route
 * component to descend into nested routes.
 *
 * `parentMatchId` is read inside the render function (not setup) so
 * that when an enclosing `<MatchContext>` is reused with a different
 * `matchId` across navigations, the Outlet picks up the new value on
 * its next render. Reading it at setup-time would freeze the parent
 * to whatever it was when the Outlet first mounted.
 */
export function Outlet(handle: Handle) {
  const router = useRouter(handle)
  const readIds = subscribeStore(handle, router.stores.matchesId)

  return (): RemixNode => {
    const parentMatchId = getMatchId(handle)
    const ids = readIds()

    if (parentMatchId === undefined) {
      const firstId = ids[0]
      return firstId ? <Match matchId={firstId} /> : null
    }

    const parentIdx = ids.findIndex((id) => id === parentMatchId)
    if (parentIdx < 0) return null
    const childId = ids[parentIdx + 1]
    return childId ? <Match matchId={childId} /> : null
  }
}
