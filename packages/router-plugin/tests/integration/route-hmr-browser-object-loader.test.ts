/**
 * Route HMR of a split loader in object form (`loader: { handler,
 * staleReloadMode }`, #8753) on a real page (`route-hmr-page.ts`), in React
 * and Solid apps on Vite: an edit of the handler shows its new data in place,
 * without a full reload, and the loader keeps its other keys.
 */
import { describe, it } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'

const timeout = 60_000

/** A route at `/` whose loader handler and the module it imports name the version. */
const route = (target: 'react' | 'solid', version: string) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
import { tag } from '../tag'
export const Route = createFileRoute('/')({
  loader: {
    staleReloadMode: 'blocking',
    handler: () => tag('data ${version}'),
  },
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <p>page {${target === 'solid' ? 'data()' : 'data'}}</p>
}
`

describe.each(['react', 'solid'] as const)('vite: a %s app', (target) => {
  it(
    'shows the new data of an edited loader handler in place and keeps the loader options',
    { timeout },
    async ({ expect, onTestFinished }: TestContext) => {
      const app = await openRouteHmrPage({
        target,
        onTestFinished,
        // only the loader is split
        pluginOptions: {
          codeSplittingOptions: { defaultBehavior: [['loader']] },
        },
        files: {
          'tag.ts': `export const tag = (text: string) => 'tagged ' + text\n`,
          'routes/index.tsx': route(target, 'v1'),
        },
        ready: 'page tagged data v1',
      })
      expect(app.splitOutputs() > 0, 'split').toBe(true)
      expect(
        await app.edit(
          { 'routes/index.tsx': route(target, 'v2') },
          'page tagged data v2',
        ),
      ).toEqual({ reloaded: false, errors: [] })
      expect(
        await app.evaluate(
          `window.__APP_ROUTER__.routesById['/'].options.loader.staleReloadMode`,
        ),
      ).toBe('blocking')
    },
  )
})
