/**
 * Source maps of real Start builds point at the code the user wrote: an
 * error thrown in a server fn handler (called during SSR) or in a split
 * route component (client) maps, through the emitted source map of the chunk
 * it runs in, to the line of the throw in the user's file. The column is
 * left out: minifiers map the throw to different tokens of the statement.
 * (`<Hydrate>` children: hydrate-build.test.ts.)
 * Source: oracle-gaps M1 (round 2).
 */
import { describe, expect, test } from 'vitest'
import { originalFrameOf } from '@tanstack/compiler-test-utils/build-harness'
import { buildStart, routerRuntimeFiles, startBundlers } from './build-harness'
import type { StartBundler } from './build-harness'

const timeout = 60_000

/** 1-based line of the first occurrence of `needle` in `code`. */
function lineOf(code: string, needle: string) {
  return code.slice(0, code.indexOf(needle)).split('\n').length
}

const builds = [
  { name: 'minified', minify: true },
  { name: 'unminified', minify: false },
]

const fns = `import { createServerFn } from '@tanstack/react-start'
import { prefix } from './prefix'
const suffix = '_THROW'
export const fail = createServerFn().handler(async () => {
  throw new Error(prefix + '_HANDLER' + suffix)
})
`

describe.each(startBundlers)('%s build', (bundler) => {
  test.each(builds)(
    'ssr: a throw in a server fn handler maps to its line in the source file ($name)',
    async ({ minify }) => {
      const { ssr } = await buildStart({
        bundler,
        minify,
        sourcemap: true,
        files: {
          'src/fns.ts': fns,
          'src/prefix.ts': `export const prefix = 'MARK'\n`,
          'entry.ts': `export { fail } from './src/fns'\n`,
        },
      })
      const { result: stack } = await ssr.run(
        `try { await entry.fail() } catch (error) { return error.stack }`,
      )
      expect(stack).toMatch(/MARK_HANDLER_THROW/)
      const { file, line } = originalFrameOf(ssr, stack as string) ?? {}
      expect({ file, line }).toEqual({
        file: 'src/fns.ts',
        line: lineOf(fns, 'throw new Error'),
      })
    },
    timeout,
  )
})

const route = `import { createFileRoute } from '@tanstack/react-router'
import { prefix } from '../prefix'
export const Route = createFileRoute('/')({ component: Page })
function Page(): never {
  throw new Error(prefix + '_PAGE_THROW')
}
`

/**
 * Builds a Start app whose index route component throws, renders the
 * component in the client build once its chunk loaded and maps the error's
 * stack frame through the emitted source map.
 */
async function expectRouteThrowMapsToRouteFile(
  bundler: StartBundler,
  { minify }: { minify: boolean },
) {
  const { client } = await buildStart({
    bundler,
    minify,
    sourcemap: true,
    files: {
      ...routerRuntimeFiles,
      'src/routes/index.tsx': route,
      'src/prefix.ts': `export const prefix = 'MARK'\n`,
      'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
      'entry.ts': `export { getRouter } from './src/router'\n`,
    },
  })
  expect(client.where('_PAGE_THROW')).toBe('lazy')
  const { result: stack } = await client.run(`const route = Object.values(
  entry.getRouter().routeTree.children,
).find((candidate) => candidate.options.id === '/')
await route.options.component.preload()
try {
  route.options.component({})
} catch (error) {
  return error.stack
}`)
  expect(stack).toMatch(/MARK_PAGE_THROW/)
  const { file, line } = originalFrameOf(client, stack as string) ?? {}
  expect({ file, line }).toEqual({
    file: 'src/routes/index.tsx',
    line: lineOf(route, 'throw new Error'),
  })
}

// Control for the pin below.
test.each(builds)(
  'vite build: client: a throw in a split route component maps to its line in the route file ($name)',
  (options) => expectRouteThrowMapsToRouteFile('vite', options),
  timeout,
)

// Bug: the router plugin's code splitter returns a source map of each route
// file it compiles, but unplugin's Rspack transform loader drops it when no
// earlier loader passed one in (`map == null ? map : res.map || map` in
// unplugin/dist/rspack/loaders/transform.mjs), so Rsbuild maps the chunk to
// the code splitter's output. Same cause as the router plugin's Rspack and
// webpack pins (router-plugin build-source-maps.test.ts).
// Source: oracle-gaps M1; upstream (unplugin).
// Impact: stack traces, devtools and error trackers of Rsbuild Start apps
// point at lines of generated code for every route file.
test.fails.each(builds)(
  'rsbuild build: client: a throw in a split route component maps to its line in the route file ($name)',
  (options) => expectRouteThrowMapsToRouteFile('rsbuild', options),
  timeout,
)
