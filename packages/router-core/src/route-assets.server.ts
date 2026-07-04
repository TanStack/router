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

const logAssetError = (match: AnyRouteMatch, error: unknown): void => {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`Error executing head for route ${match.routeId}:`, error)
  }
}

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

    const assetContext = {
      ssr: router.options.ssr,
      matches,
      match,
      params: match.params,
      loaderData: match.loaderData,
    }

    // Each asset kind commits independently: route headers are response
    // behavior and must not be dropped because a decorative head()/scripts()
    // failed, and vice versa.
    let syncFailed = false
    let head: any
    let scripts: any
    let headers: any
    try {
      head = routeOptions.head?.(assetContext)
    } catch (error) {
      syncFailed = true
      logAssetError(match, error)
    }
    try {
      scripts = routeOptions.scripts?.(assetContext)
    } catch (error) {
      syncFailed = true
      logAssetError(match, error)
    }
    try {
      headers = routeOptions.headers?.(assetContext)
    } catch (error) {
      syncFailed = true
      logAssetError(match, error)
    }

    if (syncFailed) {
      // A sync throw must not hold the response hostage waiting on the other
      // DECORATIVE hooks' async work: commit sync-available head/scripts and
      // abandon pending ones, owning their rejections so they cannot become
      // unhandled. A pending headers() promise is different — headers are
      // response behavior, so it is always awaited.
      const settle = (value: any) => {
        if (isPromise(value)) {
          void Promise.allSettled([value])
          return undefined
        }
        return value
      }
      const syncHead = settle(head)
      const syncScripts = settle(scripts)

      if (isPromise(headers)) {
        return headers.then(
          (headerValue) => {
            matches[i] = withServerAssets(
              match,
              syncHead,
              syncScripts,
              headerValue,
            )
            return projectServerRouteAssets(router, matches, i + 1)
          },
          (error) => {
            logAssetError(match, error)
            matches[i] = withServerAssets(
              match,
              syncHead,
              syncScripts,
              undefined,
            )
            return projectServerRouteAssets(router, matches, i + 1)
          },
        )
      }

      matches[i] = withServerAssets(match, syncHead, syncScripts, headers)
      continue
    }

    if (isPromise(head) || isPromise(scripts) || isPromise(headers)) {
      return Promise.allSettled([head, scripts, headers]).then(
        ([headResult, scriptResult, headerResult]) => {
          matches[i] = withServerAssets(
            match,
            headResult.status === 'fulfilled' ? headResult.value : undefined,
            scriptResult.status === 'fulfilled'
              ? scriptResult.value
              : undefined,
            headerResult.status === 'fulfilled'
              ? headerResult.value
              : undefined,
          )

          const failed = [headResult, scriptResult, headerResult].find(
            (result) => result.status === 'rejected',
          )
          if (failed) {
            logAssetError(match, failed.reason)
          }

          return projectServerRouteAssets(router, matches, i + 1)
        },
      )
    }

    matches[i] = withServerAssets(match, head, scripts, headers)
  }
}
