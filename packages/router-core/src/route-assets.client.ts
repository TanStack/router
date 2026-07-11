import { isPromise } from './utils'
import type { AnyRouteMatch } from './Matches'
import type { AnyRouter } from './router'

function commitClientAssets(
  matches: Array<AnyRouteMatch>,
  index: number,
  head: any,
  scripts: any,
): void {
  matches[index] = {
    ...matches[index]!,
    meta: head?.meta,
    links: head?.links,
    headScripts: head?.scripts,
    scripts,
    styles: head?.styles,
  }
}

/**
 * Projects head()/scripts() into the given lane.
 *
 * Returns whether every asset hook committed cleanly. Background reloads use
 * this to keep their publication atomic: fresh loaderData must not be
 * committed under assets that could not be computed for it. Ownership loss
 * also returns false — the caller's currentness check decides what to do.
 */
export function projectClientRouteAssets(
  router: AnyRouter,
  matches: Array<AnyRouteMatch>,
  preload?: boolean,
  isCurrent?: () => boolean,
  startIndex = 0,
  clean = true,
): boolean | Promise<boolean> {
  for (let i = startIndex; i < matches.length; i++) {
    const match = matches[i]!
    if (preload && !match.preload) {
      continue
    }

    const routeOptions = router.routesById[match.routeId]!.options
    if (!(routeOptions.head || routeOptions.scripts)) {
      continue
    }
    // Skipped matches execute no user code; callers re-check before publish.
    if (isCurrent && !isCurrent()) {
      return false
    }

    try {
      const assetContext = {
        ssr: router.options.ssr,
        matches,
        match,
        params: match.params,
        loaderData: match.loaderData,
      }

      const head = routeOptions.head?.(assetContext)
      if (isCurrent && !isCurrent()) {
        // This pass lost ownership before the normal Promise.all path could
        // observe `head`; allSettled owns any later rejection.
        void Promise.allSettled([head])
        return false
      }

      let scripts: any
      try {
        scripts = routeOptions.scripts?.(assetContext)
      } catch (error) {
        // `head` may be async and abandoned because `scripts` threw
        // synchronously. Own its rejection so it cannot become unhandled.
        void Promise.allSettled([head])
        throw error
      }
      if (isCurrent && !isCurrent()) {
        // This pass lost ownership before the normal Promise.all path could
        // observe the asset promises; allSettled owns any later rejection.
        void Promise.allSettled([head, scripts])
        return false
      }

      if (isPromise(head) || isPromise(scripts)) {
        return Promise.all([head, scripts]).then(
          ([headResult, scriptResult]) => {
            if (isCurrent && !isCurrent()) {
              return false
            }
            commitClientAssets(matches, i, headResult, scriptResult)
            const rest = projectClientRouteAssets(
              router,
              matches,
              preload,
              isCurrent,
              i + 1,
              clean,
            )
            return rest
          },
          (error) => {
            if (isCurrent && !isCurrent()) {
              return false
            }

            if (process.env.NODE_ENV !== 'production') {
              console.error(
                `Error executing head for route ${match.routeId}:`,
                error,
              )
            }

            return projectClientRouteAssets(
              router,
              matches,
              preload,
              isCurrent,
              i + 1,
              false,
            )
          },
        )
      }

      commitClientAssets(matches, i, head, scripts)
    } catch (error) {
      if (isCurrent && !isCurrent()) {
        return false
      }

      if (process.env.NODE_ENV !== 'production') {
        console.error(`Error executing head for route ${match.routeId}:`, error)
      }

      // Keep projecting the rest of the lane, but remember that this pass
      // cannot publish atomically even if later hooks succeed.
      clean = false
    }
  }

  return clean
}
