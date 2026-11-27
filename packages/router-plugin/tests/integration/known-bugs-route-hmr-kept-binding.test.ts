/**
 * Bug: on the webpack-family hosts, an edit of a binding the route file
 * exports doesn't reach an ordinary module of the app that imports it from
 * the route file: the route module self-accepts, so the update stops there,
 * and nothing in the route file knows the importer.
 * Impact: the page shows the old value, with no error, until a reload (SPEC
 * J3.3).
 *
 * The Vite rows are the control: the edit shows, by a hot update or a reload.
 * The edits of a binding the route module keeps and a split chunk reads:
 * route-hmr-browser-kept-binding*.test.ts.
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import { openWebpackHmrPage } from '../webpack-hmr-page'
import type { TestContext } from 'vitest'

type Target = 'react' | 'solid'

/** A route rendering `<Other />`, whose module imports `value` from the route file. */
const importedRoute = (target: Target, version: string, jsx = true) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
${jsx ? '' : `import { createElement } from 'react'\n`}import { Other } from '../other'
export const value = { text: '${version}' }
export const Route = createFileRoute('/')({
  component: () => ${jsx ? '<p><Other /></p>' : `createElement('p', null, createElement(Other))`},
})
`
const other = (jsx = true) =>
  `${jsx ? '' : `import { createElement } from 'react'\n`}import { value } from './routes/index'
export function Other() {
  return ${jsx ? '<span>shows {value.text}</span>' : `createElement('span', null, 'shows ', value.text)`}
}
`

describe(
  'an edit of a binding the route file exports and another module imports',
  { timeout: 60_000 },
  () => {
    const targets = ['react', 'solid'] as const
    const viaRouteHmrPage = async (
      bundler: 'vite' | 'rsbuild',
      target: Target,
      { onTestFinished }: TestContext,
    ) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        bundler,
        target,
        files: {
          'routes/index.tsx': importedRoute(target, 'v1'),
          'other.tsx': other(),
        },
        ready: 'shows v1',
      })
      await app.edit(
        { 'routes/index.tsx': importedRoute(target, 'v2') },
        'shows v2',
      )
    }

    test.fails.for(targets)('rsbuild %s: shows', (target, ctx) =>
      viaRouteHmrPage('rsbuild', target, ctx),
    )

    test.fails.for(targets)(
      'webpack with source maps %s: shows',
      async (target) => {
        const jsx = target === 'solid'
        const app = await openWebpackHmrPage({
          target,
          devtool: 'cheap-module-source-map',
          files: {
            'routes/index.tsx': importedRoute(target, 'v1', jsx),
            'other.tsx': other(jsx),
          },
          ready: 'shows v1',
        })
        await app.edit(
          { 'routes/index.tsx': importedRoute(target, 'v2', jsx) },
          'shows v2',
        )
      },
    )

    test.for(targets)('vite %s: shows', (target, ctx) =>
      viaRouteHmrPage('vite', target, ctx),
    )
  },
)
