/**
 * A React route update waits for React Refresh's next pass when its route
 * module still holds a component of the route (the router then takes the
 * new component as the same family, keeping its state), and applies at once
 * when it holds none (every component option split, the default): nothing
 * of the route module is React Refresh's to patch. Edits on a real dev
 * server and page (`route-hmr-page.ts`).
 *
 * The split row pauses the page's timers during the edit (Playwright's
 * clock): React Refresh's pass runs from a timer on both bundlers (Vite's
 * plugin debounces it, Rspack's waits 30 ms), so an update that waited for
 * it would not show until they run again. The overlapping-saves row pauses
 * them the same way to hold an update that waits while a newer one, which
 * holds no component, applies at once. The lazy-file row holds two updates
 * of a lazy route file that both wait.
 */
import { describe } from 'vitest'
import { it } from '../test'
import type { RouteHmrPage } from '../route-hmr-page'

const inPlace = { reloaded: false, errors: [] }

/** The index route: a loader and a component that counts its clicks. */
const route = (version: string, options = '') =>
  `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
export const Route = createFileRoute('/')({
  loader: () => 'data ${version}',
  component: Page,${options}
})
function Page() {
  const [count, setCount] = useState(0)
  const data = Route.useLoaderData()
  return <button onClick={() => setCount(count + 1)}>page {data} count {count}</button>
}
`

/**
 * An unsplit `.ts` route module (plugin-react does not compile it, so its
 * update waits for the refresh bound) recording each evaluation, whose
 * component lives in its own file; `version` 3 holds no component.
 */
const tsRoute = (version: number) =>
  `import { createElement } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { evaluated } from '../evaluations'
evaluated(${version})
export const Route = createFileRoute('/')({
  loader: () => 'L${version}',${version === 3 ? '' : `\n  component: () => createElement('p', null, 'card'),`}
})
`

/** What the root renders: the index route's evaluations and its loader data. */
const evaluationFiles = {
  'evaluations.ts': `import { useSyncExternalStore } from 'react'
let seen = ''
const listeners = new Set<() => void>()
export function evaluated(version: number) {
  seen = seen ? \`\${seen},\${version}\` : String(version)
  listeners.forEach((listener) => listener())
}
export function useEvaluations() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => seen,
  )
}
`,
  'card.tsx': `export function Card() {
  return <p>card</p>
}
`,
  'routes/__root.tsx': `import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { useEvaluations } from '../evaluations'
export const Route = createRootRoute({ component: Root })
function Root() {
  const data = useRouterState({ select: (s) => s.matches.at(-1)?.loaderData })
  return (
    <>
      <p>evaluated {useEvaluations()} data {String(data)}</p>
      <Outlet />
    </>
  )
}
`,
}

/** The index route's lazy file: a `.ts` module (no React Refresh pass for it) recording each evaluation, rendering `Card<version>`. */
const tsLazyFile = (version: number) =>
  `import { createLazyFileRoute } from '@tanstack/react-router'
import { Card${version} } from '../cards'
import { evaluated } from '../evaluations'
evaluated(${version})
export const Route = createLazyFileRoute('/')({ component: Card${version} })
`

const lazyFiles = {
  ...evaluationFiles,
  'cards.tsx': [1, 2, 3]
    .map((n) => `export function Card${n}() {\n  return <p>card ${n}</p>\n}\n`)
    .join(''),
  'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ loader: () => 'L' })
`,
}

async function clickOnce(app: RouteHmrPage) {
  await app.click('button')
  await app.page.waitForText('page data v1 count 1', { selector: '#app' })
}

describe.each(['vite', 'rsbuild'] as const)(
  '%s: a loader edit of a React route',
  (bundler) => {
    it('whose component is split shows the new data without waiting for React Refresh, keeping the component state', async ({
      expect,
      openRouteHmrPage,
    }) => {
      const app = await openRouteHmrPage({
        bundler,
        files: { 'routes/index.tsx': route('v1') },
        ready: 'page data v1 count 0',
      })
      await clickOnce(app)
      const { clock } = app.page.page
      await clock.install()
      await clock.pauseAt(Date.now() + 1_000)
      try {
        expect(
          await app.edit(
            { 'routes/index.tsx': route('v2') },
            'page data v2 count 1',
          ),
        ).toEqual(inPlace)
      } finally {
        await clock.resume()
      }
      // React Refresh's pass, once it runs, changes nothing
      await app.click('button')
      await app.page.waitForText('page data v2 count 2', {
        selector: '#app',
      })
    })

    it.for([
      { name: 'an unsplit route', autoCodeSplitting: false, options: '' },
      {
        name: 'a route whose component stays in the route module',
        autoCodeSplitting: true,
        options: `\n  codeSplitGroupings: [['errorComponent']],`,
      },
    ])(
      'of $name keeps the component state',
      async ({ autoCodeSplitting, options }, { expect, openRouteHmrPage }) => {
        const app = await openRouteHmrPage({
          bundler,
          pluginOptions: { autoCodeSplitting },
          files: { 'routes/index.tsx': route('v1', options) },
          ready: 'page data v1 count 0',
        })
        await clickOnce(app)
        expect(
          await app.edit(
            { 'routes/index.tsx': route('v2', options) },
            'page data v2 count 1',
          ),
        ).toEqual(inPlace)
      },
    )

    it('held for React Refresh does not override a newer update applied at once', async ({
      expect,
      openRouteHmrPage,
    }) => {
      const app = await openRouteHmrPage({
        bundler,
        pluginOptions: { autoCodeSplitting: false },
        files: { ...evaluationFiles, 'routes/index.ts': tsRoute(1) },
        ready: 'evaluated 1 data L1card',
      })
      const { clock } = app.page.page
      await clock.install()
      await clock.pauseAt(Date.now() + 1_000)
      try {
        // evaluated, held until the refresh pass or its bound (timers)
        expect(
          await app.edit(
            { 'routes/index.ts': tsRoute(2) },
            'evaluated 1,2 data L1card',
          ),
        ).toEqual(inPlace)
        // holds no component: applies at once
        expect(
          await app.edit(
            { 'routes/index.ts': tsRoute(3) },
            /^evaluated 1,2,3 data L3$/,
          ),
        ).toEqual(inPlace)
        // the held update's timers run: it is older than the route's
        // latest evaluation, which stays
        await clock.runFor(1_000)
      } finally {
        await clock.resume()
      }
      expect(
        await app.evaluate(`(() => {
            const options = window.__APP_ROUTER__.routesById['/'].options
            return { loader: options.loader(), component: 'component' in options }
          })()`),
      ).toEqual({ loader: 'L3', component: false })
      await app.page.waitForText(/^evaluated 1,2,3 data L3$/, {
        selector: '#app',
      })
    })

    // Bug: the older update's commit loaded its own options, and the newer
    // one, seeing the route not loaded, never applied. Impact: the page kept
    // the previous save's component until the next save or a reload.
    it('of a lazy route file held for React Refresh leaves the newest of two held updates applied', async ({
      expect,
      openRouteHmrPage,
    }) => {
      const app = await openRouteHmrPage({
        bundler,
        files: { ...lazyFiles, 'routes/index.lazy.ts': tsLazyFile(1) },
        ready: 'evaluated 1 data Lcard 1',
      })
      const { clock } = app.page.page
      await clock.install()
      await clock.pauseAt(Date.now() + 1_000)
      try {
        // each evaluated, held until the refresh pass or its bound (timers)
        for (const version of [2, 3]) {
          expect(
            await app.edit(
              { 'routes/index.lazy.ts': tsLazyFile(version) },
              `evaluated ${[1, 2, 3].slice(0, version).join(',')} data Lcard 1`,
            ),
          ).toEqual(inPlace)
        }
        await clock.runFor(1_000)
      } finally {
        await clock.resume()
      }
      expect(
        await app.evaluate(
          `window.__APP_ROUTER__.routesById['/'].options.component.name`,
        ),
      ).toBe('Card3')
      await app.page.waitForText('evaluated 1,2,3 data Lcard 3', {
        selector: '#app',
      })
      expect(app.loads()).toBe(1)
    })
  },
)
