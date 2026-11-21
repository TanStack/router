/**
 * Source maps of real Start builds point at the code the user wrote: an
 * error thrown in a server fn handler (called during SSR) or in a split
 * route component (client) maps, through the emitted source map of the chunk
 * it runs in, to the line of the throw in the user's file, whose text the map
 * holds. The column is left out: minifiers map the throw to different tokens
 * of the statement.
 * (`<Hydrate>` children: hydrate-build.test.ts.)
 */
import { describe, expect, test } from 'vitest'
import { originalFrameOf } from '@tanstack/compiler-test-utils/build-harness'
import { buildStart, startBundlers } from '../build-harness'
import type { StartBundler } from '../build-harness'
import type { InlineConfig } from 'vite'

const timeout = 60_000

/** 1-based line of the first occurrence of `needle` in `code`. */
function lineOf(code: string, needle: string) {
  return code.slice(0, code.indexOf(needle)).split('\n').length
}

/** Vite's default build target for the client (the harness builds for `esnext`). */
const viteDefaultClientTarget: InlineConfig = {
  environments: {
    client: { build: { target: 'baseline-widely-available' } },
  },
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
      const { file, line, text } = originalFrameOf(ssr, stack as string) ?? {}
      expect({ file, line, text }).toEqual({
        file: 'src/fns.ts',
        line: lineOf(fns, 'throw new Error'),
        text: fns,
      })
    },
    timeout,
  )

  // Import protection rewrites the denied import of the module (mock mode),
  // and compiling drops the type-only lines before the throw.
  test(
    'client, mock mode: a throw in a module whose denied import is mocked maps to its line in the source file (minified)',
    async () => {
      const { client } = await buildStart({
        bundler,
        minify: true,
        sourcemap: true,
        files: {
          'node_modules/db-lib/package.json': JSON.stringify({
            name: 'db-lib',
            type: 'module',
            exports: { '.': './index.js' },
          }),
          'node_modules/db-lib/index.js': `export const secret = 1\n`,
          'src/fail.ts': mockedImporter,
          'src/entry.ts': `export { fail } from './fail'\n`,
        },
        entry: 'src/entry.ts',
        start: {
          importProtection: {
            behavior: 'mock',
            client: { specifiers: ['db-lib'] },
          },
        },
      })
      const { result: stack } = await client.run(
        `try { entry.fail() } catch (error) { return error.stack }`,
      )
      expect(stack).toMatch(/MARK_THROW/)
      const { file, line } = originalFrameOf(client, stack as string) ?? {}
      expect({ file, line }).toEqual({
        file: 'src/fail.ts',
        line: lineOf(mockedImporter, 'throw new Error'),
      })
    },
    timeout,
  )
})

const mockedImporter = `import { secret } from 'db-lib'
interface Options {
  a: string
  b: number
}
type Unused = Options
export function fail(options?: Options): string {
  if (!options) {
    throw new Error('MARK_THROW' + String(secret))
  }
  return options.a
}
`

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
  { minify, viteConfig }: { minify: boolean; viteConfig?: InlineConfig },
) {
  const { client } = await buildStart({
    bundler,
    minify,
    viteConfig,
    sourcemap: true,
    files: {
      'src/routes/index.tsx': route,
      'src/prefix.ts': `export const prefix = 'MARK'\n`,
      'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
      'entry.ts': `export { getRouter } from './src/router'
export { createElement, renderToString } from './harness/render'
`,
    },
  })
  expect(client.where('_PAGE_THROW')).toBe('lazy')
  // React renders the loaded split component; its throw is the render's.
  const { result: stack } = await client.run(`const route = Object.values(
  entry.getRouter().routeTree.children,
).find((candidate) => candidate.options.id === '/')
await route.options.component.preload()
try {
  entry.renderToString(entry.createElement(route.options.component))
} catch (error) {
  return error.stack
}`)
  expect(stack).toMatch(/MARK_PAGE_THROW/)
  const { file, line, text } = originalFrameOf(client, stack as string) ?? {}
  expect({ file, line, text }).toEqual({
    file: 'src/routes/index.tsx',
    line: lineOf(route, 'throw new Error'),
    text: route,
  })
}

// Control for the pin below.
test.each(builds)(
  'vite build: client: a throw in a split route component maps to its line in the route file ($name)',
  (options) => expectRouteThrowMapsToRouteFile('vite', options),
  timeout,
)

// The harness builds for `esnext`; Vite's default client target lowers
// newer syntax, which moves code around once more.
// Source: review.
test(
  "vite build with Vite's default client target: client: a throw in a split route component maps to its line in the route file (minified)",
  () =>
    expectRouteThrowMapsToRouteFile('vite', {
      minify: true,
      viteConfig: viteDefaultClientTarget,
    }),
  timeout,
)

// The router compiler's Rspack loader passes its source map on, so Rsbuild
// maps the chunk to the route file (unplugin's transform loader dropped it
// when no earlier loader passed one in).
test.each(builds)(
  'rsbuild build: client: a throw in a split route component maps to its line in the route file ($name)',
  (options) => expectRouteThrowMapsToRouteFile('rsbuild', options),
  timeout,
)
