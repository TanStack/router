import {
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { batch, createAtom } from '@tanstack/store'
import { startTransition } from 'octane'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  CreateRouterFn,
  RouterConstructorOptions,
  TrailingSlashOption,
} from '@tanstack/router-core'

const isServerEnvironment = typeof document === 'undefined'

const octaneStoreFactory = (options: { isServer?: boolean }) => {
  if (options.isServer ?? isServerEnvironment) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (callback: () => void) => callback(),
    }
  }

  return {
    createMutableStore: createAtom,
    createReadonlyStore: createAtom,
    batch: (callback: () => void) => startTransition(() => batch(callback)),
  }
}

export const createRouter: CreateRouterFn = (options) => new Router(options)

export class Router<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption = 'never',
  in out TDefaultStructuralSharingOption extends boolean = false,
  in out TRouterHistory extends RouterHistory = RouterHistory,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> extends RouterCore<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
> {
  constructor(
    options: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
  ) {
    super(options, octaneStoreFactory)

    // A browser may defer a View Transition's update callback until after the
    // router-core load promise resolves. Track those callbacks so the public
    // load promise remains a render-readiness boundary.
    const coreLoad = this.load.bind(this)
    const coreStartViewTransition = this.startViewTransition.bind(this)
    const pendingViewCommits = new Set<Promise<void>>()
    const activeLoadScopes = new Set<Set<Promise<void>>>()

    this.startViewTransition = (fn: () => Promise<void>) => {
      let resolveCommit!: () => void
      let rejectCommit!: (error: unknown) => void
      const commit = new Promise<void>((resolve, reject) => {
        resolveCommit = resolve
        rejectCommit = reject
      })

      pendingViewCommits.add(commit)
      for (const scope of activeLoadScopes) {
        scope.add(commit)
      }

      // A later load waits for an earlier unsettled callback so no mutation can
      // land after its readiness boundary. Only the load scope that created a
      // commit owns and propagates its failure.
      void commit.then(
        () => pendingViewCommits.delete(commit),
        () => pendingViewCommits.delete(commit),
      )

      const runCommit = async () => {
        try {
          await fn()
          resolveCommit()
        } catch (error) {
          rejectCommit(error)
        }
      }

      try {
        coreStartViewTransition(runCommit)
      } catch (error) {
        rejectCommit(error)
        throw error
      }
    }

    this.load = async (...args: Parameters<typeof coreLoad>) => {
      const prerequisiteCommits = new Set(pendingViewCommits)
      const viewCommits = new Set<Promise<void>>()
      activeLoadScopes.add(viewCommits)

      let hasLoadError = false
      let loadError: unknown
      let result: Awaited<ReturnType<typeof coreLoad>>
      try {
        result = await coreLoad(...args)
      } catch (error) {
        hasLoadError = true
        loadError = error
      } finally {
        // All callbacks started by this core load have now been registered.
        // Stop accepting callbacks from later navigations before waiting.
        activeLoadScopes.delete(viewCommits)
      }

      const [, outcomes] = await Promise.all([
        Promise.allSettled(prerequisiteCommits),
        Promise.allSettled(viewCommits),
      ])
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected')

      if (hasLoadError) {
        throw loadError
      }
      if (rejected?.status === 'rejected') {
        throw rejected.reason
      }

      // RouterCore finalizes HTTP status before a platform-deferred callback
      // necessarily commits the new tree. Recompute it after render readiness,
      // preserving the authoritative status of a canonical redirect.
      const state = this.state
      const statusCode =
        state.redirect != null
          ? state.statusCode
          : this.hasNotFoundMatch()
            ? 404
            : state.matches.some((match) => match.status === 'error')
              ? 500
              : 200
      this.stores.statusCode.set(statusCode)

      return result!
    }
  }
}
