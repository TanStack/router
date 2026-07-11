import { isPromise } from './utils'
import type { AnyRouteMatch } from './Matches'
import type { AnyRouter } from './router'

const withServerAssets = (
  match: AnyRouteMatch,
  head?: any,
  scripts?: any,
  headers?: any,
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
    if (match.ssr === false) {
      // A client-only branch contributes no server response assets. Clear
      // every field as well as skipping the hooks so a reused match cannot
      // leak assets from an earlier SSR-enabled generation.
      matches[i] = withServerAssets(match)
      continue
    }
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
      // A sync throw must not hold the response hostage waiting on the
      // other DECORATIVE hooks' async work: commit sync-available
      // head/scripts and abandon pending ones, owning their rejections. An
      // async headers() remains response-significant, but it is awaited on
      // its own so a decorative promise cannot hold the response open.
      if (isPromise(head)) {
        void head.then(
          (value) => (head = value),
          (error) => logAssetError(match, error),
        )
        head = undefined
      }
      if (isPromise(scripts)) {
        void scripts.then(
          (value) => (scripts = value),
          (error) => logAssetError(match, error),
        )
        scripts = undefined
      }
      if (isPromise(headers)) {
        const commit = (value: any) => {
          matches[i] = withServerAssets(match, head, scripts, value)
          return projectServerRouteAssets(router, matches, i + 1)
        }
        return headers.then(commit, (error) => {
          logAssetError(match, error)
          return commit(undefined)
        })
      }
      matches[i] = withServerAssets(match, head, scripts, headers)
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

          for (const result of [headResult, scriptResult, headerResult]) {
            if (result.status === 'rejected') {
              logAssetError(match, result.reason)
            }
          }

          return projectServerRouteAssets(router, matches, i + 1)
        },
      )
    }

    matches[i] = withServerAssets(match, head, scripts, headers)
  }
}
