/**
 * Lazy route file edits that route HMR doesn't apply in place: the page
 * reloads, as on `main` (which reloads on every lazy file edit), and shows
 * the edit. A real dev server serves the app to a real browser page, and the
 * test edits the lazy file on disk (`route-hmr-page.ts`).
 *
 * - An edit removing an option the route file sets too: the route shows the
 *   route file's option again (Astra R4), also when the route module was
 *   edited after the route loaded its lazy file and before it was shown
 *   again (review of the route HMR implementation, 11-23).
 *
 * And one an edit applies in place now: another router on the page, created
 * after the app's (a widget with a route of the same id): the edit reaches
 * the app's route and leaves the widget alone (Astra R3).
 */
import { describe, it } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'

const timeout = 90_000

type Target = 'react' | 'solid' | 'vue'

const lazyPage = (text: string) =>
  `import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/')({ component: () => <p>${text}</p> })
`

/** The app's router in `#app`, then a widget's router of its own (route `/` too) in `#widget`. */
const twoRouters = `import { createRoot } from 'react-dom/client'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
;(window as any).__APP_ROUTER__ = router
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
const widgetRoot = createRootRoute()
const widgetIndex = createRoute({
  getParentRoute: () => widgetRoot,
  path: '/',
  component: () => <p>Widget</p>,
})
const widget = createRouter({
  routeTree: widgetRoot.addChildren([widgetIndex]),
  history: createMemoryHistory({ initialEntries: ['/'] }),
})
;(window as any).__WIDGET_ROUTER__ = widget
const element = document.createElement('div')
element.id = 'widget'
document.body.append(element)
createRoot(element).render(<RouterProvider router={widget} />)
`

describe.each(['vite', 'rsbuild'] as const)(
  '%s: a react app with a second router',
  (bundler) => {
    it(
      "shows a lazy route file's edit in the app's route and leaves the other router's route alone",
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          files: {
            'main.tsx': twoRouters,
            'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({})
`,
            'routes/index.lazy.tsx': lazyPage('App_A'),
          },
          ready: 'App_A',
        })
        await app.page.waitForText('Widget', { selector: '#widget' })
        expect(
          (
            await app.edit(
              { 'routes/index.lazy.tsx': lazyPage('App_B') },
              'App_B',
            )
          ).errors,
        ).toEqual([])
        // the widget's next load of its route
        await app.evaluate('window.__WIDGET_ROUTER__.invalidate()')
        expect(await app.page.text('#widget')).toBe('Widget')
        expect(await app.page.text('#app')).toBe('App_B')
      },
    )
  },
)

const routeWithComponent = (target: Target) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({ component: () => <p>Eager</p> })
`
const lazyFile = (target: Target, options: string) =>
  `import { createLazyFileRoute } from '@tanstack/${target}-router'
export const Route = createLazyFileRoute('/')({ ${options} })
`

describe.each([
  { bundler: 'vite', target: 'react' },
  { bundler: 'vite', target: 'solid' },
  { bundler: 'vite', target: 'vue' },
  { bundler: 'rsbuild', target: 'react' },
  { bundler: 'rsbuild', target: 'solid' },
  { bundler: 'rsbuild', target: 'vue' },
] as const)('$bundler: a $target app', ({ bundler, target }) => {
  it(
    "shows the route file's component once an edit removes the lazy file's",
    { timeout },
    async ({ expect, onTestFinished }: TestContext) => {
      const app = await openRouteHmrPage({
        bundler,
        target,
        onTestFinished,
        files: {
          'routes/index.tsx': routeWithComponent(target),
          'routes/index.lazy.tsx': lazyFile(
            target,
            'component: () => <p>Lazy</p>',
          ),
        },
        ready: 'Lazy',
      })
      expect(
        (
          await app.edit(
            {
              'routes/index.lazy.tsx': lazyFile(
                target,
                'notFoundComponent: () => <p>Missing</p>',
              ),
            },
            'Eager',
          )
        ).errors,
      ).toEqual([])
    },
  )
})

describe.each(['vite', 'rsbuild'] as const)(
  '%s: a react app whose lazy route is not on screen',
  (bundler) => {
    it(
      "shows the route file's component once an edit removes the lazy file's, after an edit of the route module",
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const other = (loader: string) =>
          `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/other')({
  loader: () => '${loader}',
  component: () => <p>Eager other</p>,
})
`
        const otherLazy = (options: string) =>
          `import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/other')({ ${options} })
`
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          files: {
            'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>Home</p> })
`,
            'routes/other.tsx': other('v1'),
            'routes/other.lazy.tsx': otherLazy(
              'component: () => <p>Lazy other</p>',
            ),
          },
          ready: 'Home',
        })
        const visit = async (to: string, shows: string) => {
          await app.evaluate(
            `void window.__APP_ROUTER__.navigate({ to: ${JSON.stringify(to)} })`,
          )
          await app.page.waitForText(shows, { selector: '#app' })
        }
        await visit('/other', 'Lazy other')
        await visit('/', 'Home')
        await app.edit({ 'routes/other.tsx': other('v2') }, 'Home')
        await app.edit(
          {
            'routes/other.lazy.tsx': otherLazy(
              'notFoundComponent: () => <p>Missing</p>',
            ),
          },
          'Home',
        )
        await visit('/other', 'other')
        expect(await app.page.text('#app')).toBe('Eager other')
      },
    )
  },
)

describe.each(['vite', 'rsbuild'] as const)(
  '%s: a react app whose lazy route is not on screen, its route file without a component',
  (bundler) => {
    it(
      "no longer shows the lazy file's component once an edit removes it, after an edit of the route module",
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        // (review of the implementation, Gemini F3: the route module sets no
        // component, so only the lazy file's ever reached the route)
        const other = (loader: string) =>
          `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/other')({ loader: () => '${loader}' })
`
        const otherLazy = (options: string) =>
          `import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/other')({ ${options} })
`
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          files: {
            'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>Home</p> })
`,
            'routes/other.tsx': other('v1'),
            'routes/other.lazy.tsx': otherLazy(
              'component: () => <p>Lazy other</p>',
            ),
          },
          ready: 'Home',
        })
        const visit = (to: string) =>
          app.evaluate(
            `window.__APP_ROUTER__.navigate({ to: ${JSON.stringify(to)} }).then(() => document.querySelector('#app').innerText)`,
          )
        await visit('/other')
        await app.page.waitForText('Lazy other', { selector: '#app' })
        await visit('/')
        await app.page.waitForText('Home', { selector: '#app' })
        await app.edit({ 'routes/other.tsx': other('v2') }, 'Home')
        await app.edit(
          {
            'routes/other.lazy.tsx': otherLazy(
              'notFoundComponent: () => <p>Missing</p>',
            ),
          },
          'Home',
        )
        expect(await visit('/other')).toBe('')
      },
    )
  },
)
