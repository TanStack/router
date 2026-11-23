/**
 * Route HMR on a page with two routers (SPEC J3.3): the app's file-based
 * router and a widget's code router, both with an eager route `/`. An edit of
 * the app's route file shows in the app's route, in the document the page
 * loaded, whichever router the entry creates last, and leaves the widget's
 * route as it is. (Lazy routes: route-hmr-browser-two-routers-lazy.test.ts.)
 */
import { describe, it } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import { hosts, read, twoRouters } from './route-hmr-two-routers-cases'
import type { TargetFramework } from '../route-app'
import type { TestContext } from 'vitest'

const timeout = 90_000

const loaderRoute = (target: TargetFramework, version: string) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
  loader: () => 'data ${version}',
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <p>app {data${read[target]}}</p>
}
`

describe.concurrent.each(hosts)(
  '$bundler $target: two routers on a page',
  ({ bundler, target }) => {
    it.for([
      { order: 'widget-last', autoCodeSplitting: true },
      { order: 'widget-last', autoCodeSplitting: false },
      { order: 'widget-first', autoCodeSplitting: true },
    ] as const)(
      "an eager route file's loader edits show in the app's route ($order, autoCodeSplitting: $autoCodeSplitting)",
      { timeout },
      async (
        { order, autoCodeSplitting },
        { expect, onTestFinished }: TestContext,
      ) => {
        const app = await openRouteHmrPage({
          bundler,
          target,
          onTestFinished,
          pluginOptions: { autoCodeSplitting },
          files: {
            'main.tsx': twoRouters(target, 'eager', order),
            'routes/index.tsx': loaderRoute(target, 'v1'),
          },
          ready: 'app data v1',
        })
        await app.page.waitForText('Widget widget data', {
          selector: '#widget',
        })
        for (const n of [2, 3]) {
          const result = await app.edit(
            { 'routes/index.tsx': loaderRoute(target, `v${n}`) },
            `app data v${n}`,
          )
          expect({
            app: await app.page.text('#app'),
            widget: await app.page.text('#widget'),
            errors: result.errors,
            loads: app.loads(),
          }).toEqual({
            app: `app data v${n}`,
            widget: 'Widget widget data',
            errors: [],
            loads: 1,
          })
        }
      },
    )
  },
)
