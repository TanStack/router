/**
 * Fixed (kept as regression tests): on the webpack-family hosts, an edit of a
 * binding the route module keeps and a split chunk imports from it didn't
 * reach the chunk. The route module self-accepts, so the update stopped
 * there; the chunk's text didn't change, so it wasn't in the update, and it
 * went on reading the exports of the route module's first evaluation. The
 * route module's evaluation now invalidates the chunks reading what it keeps
 * (route-hmr-browser-kept-binding.test.ts has the other edits).
 *
 * Bug: the same edit doesn't reach an ordinary module of the app that imports
 * the binding from the route file: nothing in the route file knows it.
 * Impact: the page shows the old value, with no error, until a reload (SPEC
 * J3.3).
 *
 * The Vite rows are the control: the edit shows, by a hot update or a reload.
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import { openWebpackHmrPage } from '../webpack-hmr-page'
import type { TestContext } from 'vitest'

type Target = 'react' | 'solid'

const shapes = {
  primitive: {
    declare: (version: string) => `export const value = '${version}'`,
    read: 'value',
  },
  object: {
    declare: (version: string) => `export const value = { text: '${version}' }`,
    read: 'value.text',
  },
  function: {
    declare: (version: string) =>
      `export function value() { return '${version}' }`,
    read: 'value()',
  },
  'unexported object': {
    declare: (version: string) => `const value = { text: '${version}' }`,
    read: 'value.text',
  },
  'unexported function': {
    declare: (version: string) => `function value() { return '${version}' }`,
    read: 'value()',
  },
}

type Shape = keyof typeof shapes

const route = (
  target: Target,
  shape: Shape,
  loaderReads: boolean,
  version: string,
) => {
  const { declare, read } = shapes[shape]
  return `import { createFileRoute } from '@tanstack/${target}-router'
${declare(version)}
export const Route = createFileRoute('/')({
  ${loaderReads ? `loader: () => ${read},` : ''}
  component: Page,
})
function Page() {
  return <p>shows {${read}}</p>
}
`
}

const run = async (
  bundler: 'vite' | 'rsbuild',
  target: Target,
  shape: Shape,
  loaderReads: boolean,
  { onTestFinished }: TestContext,
) => {
  const file = 'routes/index.tsx'
  const app = await openRouteHmrPage({
    onTestFinished,
    bundler,
    target,
    files: { [file]: route(target, shape, loaderReads, 'v1') },
    ready: 'shows v1',
  })
  await app.edit(
    { [file]: route(target, shape, loaderReads, 'v2') },
    'shows v2',
  )
}

const rows = (['react', 'solid'] as const).flatMap((target) => [
  { target, shape: 'primitive' as const, loaderReads: true },
  { target, shape: 'object' as const, loaderReads: true },
  { target, shape: 'function' as const, loaderReads: true },
  { target, shape: 'unexported object' as const, loaderReads: true },
  { target, shape: 'unexported function' as const, loaderReads: true },
  { target, shape: 'object' as const, loaderReads: false },
])

describe.concurrent(
  'an edit of a binding the route module keeps and a chunk reads',
  { timeout: 60_000 },
  () => {
    test.for(rows)(
      'rsbuild $target: $shape (the loader reads it: $loaderReads) shows',
      ({ target, shape, loaderReads }, ctx) =>
        run('rsbuild', target, shape, loaderReads, ctx),
    )

    test.for(rows)(
      'vite $target: $shape (the loader reads it: $loaderReads) shows',
      ({ target, shape, loaderReads }, ctx) =>
        run('vite', target, shape, loaderReads, ctx),
    )
  },
)

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

describe.concurrent(
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
