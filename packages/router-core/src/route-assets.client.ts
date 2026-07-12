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

export function projectClientRouteAssets(
  router: AnyRouter,
  matches: Array<AnyRouteMatch>,
  preload?: boolean,
  isCurrent?: () => boolean,
  startIndex = 0,
): void | Promise<void> {
  for (let i = startIndex; i < matches.length; i++) {
    if (isCurrent && !isCurrent()) {
      return
    }

    const match = matches[i]!
    if (preload && !match.preload) {
      continue
    }

    const routeOptions = router.routesById[match.routeId]!.options
    if (!(routeOptions.head || routeOptions.scripts)) {
      continue
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
        return
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
        return
      }

      if (isPromise(head) || isPromise(scripts)) {
        return Promise.all([head, scripts]).then(
          ([headResult, scriptResult]) => {
            if (!isCurrent || isCurrent()) {
              commitClientAssets(matches, i, headResult, scriptResult)
              return projectClientRouteAssets(
                router,
                matches,
                preload,
                isCurrent,
                i + 1,
              )
            }
          },
          (error) => {
            if (!isCurrent || isCurrent()) {
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
              )
            }
          },
        )
      }

      commitClientAssets(matches, i, head, scripts)
    } catch (error) {
      if (isCurrent && !isCurrent()) {
        return
      }

      if (process.env.NODE_ENV !== 'production') {
        console.error(`Error executing head for route ${match.routeId}:`, error)
      }
    }
  }
}
