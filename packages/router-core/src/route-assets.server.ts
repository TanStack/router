import { isPromise } from './utils'
import type { AnyRouteMatch } from './Matches'
import type { AnyRouter } from './router'

const withServerAssets = (
  match: AnyRouteMatch,
  head: any,
  scripts: any,
  headers: any,
): AnyRouteMatch => ({
  ...match,
  meta: head?.meta,
  links: head?.links,
  headScripts: head?.scripts,
  scripts,
  styles: head?.styles,
  headers,
})

export const projectServerRouteAssets = (
  router: AnyRouter,
  matches: Array<AnyRouteMatch>,
  startIndex = 0,
): void | Promise<void> => {
  for (let i = startIndex; i < matches.length; i++) {
    const match = matches[i]!
    const routeOptions = router.routesById[match.routeId]!.options
    if (!(routeOptions.head || routeOptions.scripts || routeOptions.headers)) {
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
      let scripts: any
      try {
        scripts = routeOptions.scripts?.(assetContext)
      } catch (error) {
        // `head` may be async and abandoned because `scripts` threw
        // synchronously. Own its rejection so it cannot become unhandled.
        void Promise.allSettled([head])
        throw error
      }
      let headers: any
      try {
        headers = routeOptions.headers?.(assetContext)
      } catch (error) {
        // `head`/`scripts` may be async and abandoned because `headers` threw
        // synchronously. Own rejections so they cannot become unhandled.
        void Promise.allSettled([head, scripts])
        throw error
      }

      if (isPromise(head) || isPromise(scripts) || isPromise(headers)) {
        return continueServerRouteAssets(
          router,
          matches,
          i,
          match,
          head,
          scripts,
          headers,
        )
      }

      matches[i] = withServerAssets(match, head, scripts, headers)
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`Error executing head for route ${match.routeId}:`, error)
      }
    }
  }
}

const continueServerRouteAssets = async (
  router: AnyRouter,
  matches: Array<AnyRouteMatch>,
  startIndex: number,
  firstMatch: AnyRouteMatch,
  firstHead: any,
  firstScripts: any,
  firstHeaders: any,
): Promise<void> => {
  let i = startIndex
  let match = firstMatch
  let head = firstHead
  let scripts = firstScripts
  let headers = firstHeaders

  while (true) {
    const results = await Promise.allSettled([head, scripts, headers])

    const headResult = results[0]
    const scriptResult = results[1]
    const headerResult = results[2]

    if (
      headResult.status === 'fulfilled' &&
      scriptResult.status === 'fulfilled' &&
      headerResult.status === 'fulfilled'
    ) {
      matches[i] = withServerAssets(
        match,
        headResult.value,
        scriptResult.value,
        headerResult.value,
      )
    } else if (process.env.NODE_ENV !== 'production') {
      const failed =
        headResult.status === 'rejected'
          ? headResult
          : scriptResult.status === 'rejected'
            ? scriptResult
            : headerResult
      console.error(
        `Error executing head for route ${match.routeId}:`,
        (failed as PromiseRejectedResult).reason,
      )
    }

    for (i++; i < matches.length; i++) {
      match = matches[i]!
      const routeOptions = router.routesById[match.routeId]!.options
      if (
        !(routeOptions.head || routeOptions.scripts || routeOptions.headers)
      ) {
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

        head = routeOptions.head?.(assetContext)
        try {
          scripts = routeOptions.scripts?.(assetContext)
        } catch (error) {
          // `head` may be async and abandoned because `scripts` threw
          // synchronously. Own its rejection so it cannot become unhandled.
          void Promise.allSettled([head])
          throw error
        }
        try {
          headers = routeOptions.headers?.(assetContext)
        } catch (error) {
          // `head`/`scripts` may be async and abandoned because `headers` threw
          // synchronously. Own rejections so they cannot become unhandled.
          void Promise.allSettled([head, scripts])
          throw error
        }

        if (isPromise(head) || isPromise(scripts) || isPromise(headers)) {
          break
        }

        matches[i] = withServerAssets(match, head, scripts, headers)
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(
            `Error executing head for route ${match.routeId}:`,
            error,
          )
        }
      }
    }

    if (i >= matches.length) {
      return
    }
  }
}
