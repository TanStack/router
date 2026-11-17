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
 * it would not show until they run again.
 */
import { describe, it } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'
import type { RouteHmrPage } from '../route-hmr-page'

const timeout = 90_000

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

async function clickOnce(app: RouteHmrPage) {
  await app.click('button')
  await app.page.waitForText('page data v1 count 1', { selector: '#app' })
}

describe.concurrent.each(['vite', 'rsbuild'] as const)(
  '%s: a loader edit of a React route',
  (bundler) => {
    it(
      'whose component is split shows the new data without waiting for React Refresh, keeping the component state',
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
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
      },
    )

    it.for([
      { name: 'an unsplit route', autoCodeSplitting: false, options: '' },
      {
        name: 'a route whose component stays in the route module',
        autoCodeSplitting: true,
        options: `\n  codeSplitGroupings: [['errorComponent']],`,
      },
    ])(
      'of $name keeps the component state',
      { timeout },
      async (
        { autoCodeSplitting, options },
        { expect, onTestFinished }: TestContext,
      ) => {
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
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
  },
)
