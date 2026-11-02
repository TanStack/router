/**
 * Bug: on the webpack-family hosts, an edit of a binding the route module keeps
 * and a split chunk imports from it doesn't reach the chunk. The route module
 * self-accepts, so the update stops there; the chunk's text didn't change, so
 * it isn't in the update, and it goes on reading the exports of the route
 * module's first evaluation.
 * Impact: the page shows the old value next to the new loader data, with no
 * error, on this edit and on later ones, until a reload (SPEC J3.3).
 * The Vite rows are the control: the edit shows, by a hot update or a reload.
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
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
    test.fails.for(rows)(
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
