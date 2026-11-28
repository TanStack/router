/**
 * Route HMR on a page with two routers (SPEC J3.3): the app's file-based
 * router and a widget's code router, both with a lazy route `/`. An edit of
 * the app's lazy route file shows in the app's route, in the document the
 * page loaded, and leaves the widget's route as it is, whichever router the
 * entry creates last. (Eager routes: route-hmr-browser-two-routers.test.ts.)
 */
import { describe } from 'vitest'
import { it } from '../test'
import {
  emptyRoute,
  hosts,
  lazyFile,
  twoRouters,
} from './route-hmr-two-routers-cases'

const timeout = 90_000

const widgetLazy = (target: string) =>
  `import { createLazyRoute } from '@tanstack/${target}-router'
export const Route = createLazyRoute('/')({ component: WidgetPage })
function WidgetPage() {
  return <p>Widget</p>
}
`

describe.each(hosts)(
  '$bundler $target: two routers that both load a lazy `/`',
  ({ bundler, target }) => {
    it.for(['widget-last', 'widget-first'] as const)(
      "a lazy route file's edits show in the app's route and leave the other router's alone (%s)",
      { timeout },
      async (order, { expect, openRouteHmrPage }) => {
        const app = await openRouteHmrPage({
          bundler,
          target,
          files: {
            'main.tsx': twoRouters(target, 'lazy', order),
            'widget.lazy.tsx': widgetLazy(target),
            'routes/index.tsx': emptyRoute(target),
            'routes/index.lazy.tsx': lazyFile(target, 'App_1'),
          },
          ready: 'App_1',
        })
        await app.page.waitForText('Widget', { selector: '#widget' })
        for (const n of [2, 3]) {
          const result = await app.edit(
            { 'routes/index.lazy.tsx': lazyFile(target, `App_${n}`) },
            `App_${n}`,
          )
          // the widget's router loads its route again: it still renders its own
          await app.evaluate('window.__WIDGET_ROUTER__.invalidate()')
          expect({
            app: await app.page.text('#app'),
            widget: await app.page.text('#widget'),
            errors: result.errors,
            loads: app.loads(),
          }).toEqual({
            app: `App_${n}`,
            widget: 'Widget',
            errors: [],
            loads: 1,
          })
        }
      },
    )
  },
)
