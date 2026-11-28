/**
 * Shared by the route HMR page pins (integration/known-bugs-route-hmr*.test.ts):
 * the outcome of an edit applied in place, and an edit of one route file
 * on a real page (`route-hmr-page.ts`).
 */
import type { EditResult, RouteHmrPageOptions } from './route-hmr-page'
import type { RouterFixtures } from './test'

/** An edit that showed without a full reload and without errors. */
export const inPlace = { reloaded: false, errors: [] }

/**
 * Opens an app whose route file `file` is `route('v1')`, waits until it
 * shows `shows('v1')`, edits it to `route('v2')` and returns the result of
 * the edit once the page shows `shows('v2')`.
 */
export async function editRoute(
  openRouteHmrPage: RouterFixtures['openRouteHmrPage'],
  {
    file,
    route,
    shows,
    ...options
  }: Partial<RouteHmrPageOptions> & {
    file: string
    route: (version: string) => string
    shows: (version: string) => string
  },
): Promise<EditResult> {
  const app = await openRouteHmrPage({
    ...options,
    files: { ...options.files, [file]: route('v1') },
    ready: shows('v1'),
  })
  return app.edit({ [file]: route('v2') }, shows('v2'))
}
