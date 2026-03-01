import * as Angular from '@angular/core'
import { injectRouter } from '../injectRouter'
import { injectRouterState } from '../injectRouterState'
import type { AnyRoute } from '@tanstack/router-core'

export function injectIsCatchingError({
  matchId,
}: {
  matchId: Angular.Signal<string | undefined>
}): Angular.Signal<boolean> {
  const router = injectRouter()

  const matches = injectRouterState({
    select: (s) => s.matches,
  })

  const matchIndex = Angular.computed(() => {
    return matches().findIndex((m) => m.id === matchId())
  })

  return Angular.computed(() => {
    // The child route will handle the error with the default error component.
    if (router.options.defaultErrorComponent != null) return false;

    const startingIndex = matchIndex()
    if (startingIndex === -1) return false
    const matchesList = matches()

    for (let i = startingIndex + 1; i < matchesList.length; i++) {
      const descendant = matchesList[i]
      const route = router.routesById[descendant?.routeId] as AnyRoute
      // Is catched by a child route with an error component.
      if (route.options.errorComponent != null) return false

      // Found error status without error component in between.
      if (descendant?.status === "error") return true
    }
    return false
  })
}
