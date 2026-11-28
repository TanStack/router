/**
 * Route HMR where two routers hold routes of the same id (SPEC J3.3):
 *
 * - two routers of one route tree (a second router created last, mounted
 *   or not; React StrictMode calling a state initializer that creates the
 *   router twice): every router shows a route file's edit;
 * - two route trees of one app, each compiled by a router plugin instance of
 *   its own (TanStack/router#7174; on Vite also a generator and code
 *   splitter pair per tree sharing a context of their own, #7313), both
 *   with a route `/`: an edit of one tree's file shows in its router and
 *   runs its loader once, and the other tree's route keeps its own code.
 *
 * Each in the document the page loaded.
 */
import { describe } from 'vitest'
import { it } from '../test'
import {
  emptyRoute,
  lazyFile,
  loaderRoute,
  twoTrees,
  widgetTree,
} from './route-hmr-two-routers-cases'

const sharedMains = {
  'a second router created last, never mounted': `import { createRoot } from 'react-dom/client'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
;(window as any).__APP_ROUTER__ = router
;(window as any).__SECOND__ = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
`,
  'a second router created last, mounted': `import { createRoot } from 'react-dom/client'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
;(window as any).__APP_ROUTER__ = router
const second = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
const element = document.createElement('div')
element.id = 'widget'
document.body.append(element)
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
createRoot(element).render(<RouterProvider router={second} />)
`,
  // (React calls a state initializer twice in StrictMode)
  'StrictMode, the router created in a state initializer': `import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
function App() {
  const [router] = useState(() => createRouter({ routeTree }))
  return <RouterProvider router={router} />
}
createRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>)
`,
}

describe.each(['vite', 'rsbuild'] as const)(
  '%s react: two routers of one route tree',
  (bundler) => {
    it.for(Object.keys(sharedMains) as Array<keyof typeof sharedMains>)(
      'a loader edit shows in every router of the tree (%s)',
      async (name, { expect, openRouteHmrPage }) => {
        const mounted = name === 'a second router created last, mounted'
        const app = await openRouteHmrPage({
          bundler,
          files: {
            'main.tsx': sharedMains[name],
            'routes/index.tsx': loaderRoute('react', 'shared data v1'),
          },
          ready: 'shared data v1',
        })
        for (const n of [2, 3]) {
          const result = await app.edit(
            { 'routes/index.tsx': loaderRoute('react', `shared data v${n}`) },
            `shared data v${n}`,
          )
          expect({
            app: await app.page.text('#app'),
            widget: mounted ? await app.page.text('#widget') : undefined,
            errors: result.errors,
            loads: app.loads(),
          }).toEqual({
            app: `shared data v${n}`,
            widget: mounted ? `shared data v${n}` : undefined,
            errors: [],
            loads: 1,
          })
        }
      },
    )
  },
)

const root = (target: string) =>
  `import { createRootRoute } from '@tanstack/${target}-router'
export const Route = createRootRoute({})
`

/** What both routers show and how often each tree's loader ran. */
const state = `({
  app: document.querySelector('#app')?.textContent,
  widget: document.querySelector('#widget')?.textContent,
  appRuns: globalThis.__appRuns,
  widgetRuns: globalThis.__widgetRuns,
})`

describe.each([
  { bundler: 'vite', target: 'react', plugins: 'tanstackRouter()' },
  { bundler: 'vite', target: 'solid', plugins: 'tanstackRouter()' },
  { bundler: 'vite', target: 'vue', plugins: 'tanstackRouter()' },
  { bundler: 'vite', target: 'react', plugins: 'generator and splitter' },
  // (the split chunk and kept-reader reports of webpack-style hosts)
  { bundler: 'rsbuild', target: 'react', plugins: 'tanstackRouter()' },
  { bundler: 'rsbuild', target: 'solid', plugins: 'tanstackRouter()' },
] as const)(
  '$bundler $target: two route trees, each compiled by a router plugin of its own ($plugins)',
  ({ bundler, target, plugins }) => {
    // (an instance compiling the other's routes would refresh them on its
    // edits, or split them twice; `generator and splitter`: each tree's
    // pair shares a context of its own, TanStack/router#7313)
    it("an edit of each tree's route `/` shows in its own router, whose loader runs once; the other tree's `/` keeps its code", async ({
      expect,
      openRouteHmrPage,
    }) => {
      const app = await openRouteHmrPage({
        bundler,
        target,
        moreRouteTrees: [widgetTree],
        explicitContext: plugins === 'generator and splitter',
        files: {
          'main.tsx': twoTrees(target),
          'routes/index.tsx': loaderRoute(
            target,
            'app v1',
            'Page',
            '__appRuns',
          ),
          'widget-routes/__root.tsx': root(target),
          'widget-routes/index.tsx': loaderRoute(
            target,
            'widget v1',
            'Widget',
            '__widgetRuns',
          ),
        },
        ready: 'app v1',
      })
      await app.page.waitForText('widget v1', { selector: '#widget' })
      const edits = [
        { file: 'routes/index.tsx', shows: 'app v2', ran: 'app' },
        { file: 'routes/index.tsx', shows: 'app v3', ran: 'app' },
        {
          file: 'widget-routes/index.tsx',
          shows: 'widget v2',
          ran: 'widget',
        },
      ] as const
      let last = {
        app: 'app v1',
        widget: 'widget v1',
        appRuns: 1,
        widgetRuns: 1,
      }
      for (const { file, shows, ran } of edits) {
        const result = await app.edit(
          {
            [file]:
              ran === 'app'
                ? loaderRoute(target, shows, 'Page', '__appRuns')
                : loaderRoute(target, shows, 'Widget', '__widgetRuns'),
          },
          // (the edit's outcome is read in `#app`: the app's text, which a
          // widget edit leaves as it is)
          ran === 'app' ? shows : last.app,
        )
        await app.page.waitForText(shows, { selector: `#${ran}` })
        const expected = {
          ...last,
          [ran]: shows,
          [`${ran}Runs`]: last[`${ran}Runs`] + 1,
        }
        expect({
          ...(await app.evaluate<typeof last>(state)),
          errors: result.errors,
          loads: app.loads(),
        }).toEqual({ ...expected, errors: [], loads: 1 })
        // the other tree's router loads its route again: it still renders
        // its own code
        const other = ran === 'app' ? 'widget' : 'app'
        await app.evaluate(
          `window.${other === 'app' ? '__APP_ROUTER__' : '__WIDGET_ROUTER__'}.invalidate()`,
        )
        await app.page.waitForText(expected[other], { selector: `#${other}` })
        last = await app.evaluate<typeof last>(state)
        expect(last).toEqual({
          ...expected,
          [`${other}Runs`]: expected[`${other}Runs`] + 1,
        })
      }
    })

    it("an edit of the app tree's lazy route file shows in the app's router; the other tree's keeps its code", async ({
      expect,
      openRouteHmrPage,
    }) => {
      const app = await openRouteHmrPage({
        bundler,
        target,
        moreRouteTrees: [widgetTree],
        explicitContext: plugins === 'generator and splitter',
        files: {
          'main.tsx': twoTrees(target),
          'routes/index.tsx': emptyRoute(target),
          'routes/index.lazy.tsx': lazyFile(target, 'app v1'),
          'widget-routes/__root.tsx': root(target),
          'widget-routes/index.tsx': emptyRoute(target),
          'widget-routes/index.lazy.tsx': lazyFile(target, 'widget', 'Widget'),
        },
        ready: 'app v1',
      })
      await app.page.waitForText('widget', { selector: '#widget' })
      for (const n of [2, 3]) {
        const result = await app.edit(
          { 'routes/index.lazy.tsx': lazyFile(target, `app v${n}`) },
          `app v${n}`,
        )
        await app.evaluate('window.__WIDGET_ROUTER__.invalidate()')
        expect({
          app: await app.page.text('#app'),
          widget: await app.page.text('#widget'),
          errors: result.errors,
          loads: app.loads(),
        }).toEqual({
          app: `app v${n}`,
          widget: 'widget',
          errors: [],
          loads: 1,
        })
      }
    })
  },
)
