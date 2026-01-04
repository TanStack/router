import { FromPathOption, RegisteredRouter } from '@tanstack/router-core'
import { AnyRouter } from '@tanstack/router-core'
import { injectMatch } from '@tanstack/angular-router'
import { DestroyRef, inject, untracked } from '@angular/core'
import { injectRouter } from '@tanstack/angular-router'

/**
 * EXPERIMENTAL
 *
 * While in other adapters you can use build-in error boundaries,
 * Angular does not provide any. As an workarraound, we export a function
 * to simulate an error boundary by changing the router state to show
 * the error component.
 *
 * Note that an equivalent for suspense can't exist since we can't restore
 * the component state when the promise is resolved as is with other adapters.
 */
export function injectRouteErrorHandler<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(options: { from?: FromPathOption<TRouter, TDefaultFrom> }) {
  const router = injectRouter()
  const match = injectMatch({ from: options.from })

  let destroyed = false

  inject(DestroyRef).onDestroy(() => {
    destroyed = true
  })

  return {
    throw: (error: Error) => {
      if (destroyed) {
        console.warn(
          'Attempted to throw error to route after it has been destroyed',
        )
        return
      }

      const matchId = untracked(match).id

      router.updateMatch(matchId, (match) => {
        return {
          ...match,
          error,
          status: 'error',
          isFetching: false,
          updatedAt: Date.now(),
        }
      })
    },
  }
}
