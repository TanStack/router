/**
 * Source maps of real client builds point at the code the user wrote: an
 * error thrown inside a split route component maps, through the emitted
 * source map of the chunk it runs in, to the line of the throw in the route
 * file. (That the maps name split code by the route file, without the
 * virtual module's query, is pinned in known-bugs-code-splitter.test.ts,
 * "source maps".)
 */
import { describe, expect, test } from 'vitest'
import {
  namedSegments,
  originalFrameOf,
} from '@tanstack/compiler-test-utils/build-harness'
import { build, routeApp, routeHead } from './build-harness'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 60_000

const route = `${routeHead()}import { label } from '../lib/label'
const shared = { label }
function Page(): never {
  throw new Error('MARK_PAGE_THROW ' + shared.label)
}
export const Route = createFileRoute('/')({
  loader: () => shared,
  component: Page,
})
`

/** Mounts a component and returns the stack of the error it threw. */
const mountEntry = `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
export * from './routes/index'
export async function mountError(component: any) {
  await component.preload?.()
  let stack: string | undefined
  const root = createRoot(document.getElementById('root')!, {
    onUncaughtError: (error: unknown) => {
      stack = (error as Error).stack
    },
  })
  flushSync(() => root.render(createElement(component)))
  return stack
}
`

/** 1-based line of the first occurrence of `needle` in `code`. */
function lineOf(code: string, needle: string) {
  return code.slice(0, code.indexOf(needle)).split('\n').length
}

const builds = [
  { name: 'minified', minify: true },
  { name: 'unminified', minify: false },
]

/**
 * Builds the route for the client with source maps, mounts its split
 * component, which throws, and maps the error's stack frame through the
 * emitted source map.
 */
async function expectThrowMapsToRouteFile(
  bundler: Bundler,
  { minify }: { minify: boolean },
) {
  const app = await build({
    bundler,
    env: 'client',
    minify,
    sourcemap: true,
    files: routeApp(route, {
      env: 'client',
      files: {
        'lib/label.ts': `export const label = 'MARK_LABEL'\n`,
        'entry.ts': mountEntry,
      },
    }),
  })
  expect(app.where('MARK_PAGE_THROW')).toBe('lazy')
  const { result: stack } = await app.run(
    'return await entry.mountError(entry.Route.options.component)',
  )
  expect(stack).toMatch(/MARK_PAGE_THROW MARK_LABEL/)
  // The column is left out: minifiers map the throw to different tokens of
  // the statement.
  const { file, line } = originalFrameOf(app, stack as string) ?? {}
  expect({ file, line }).toEqual({
    file: 'routes/index.tsx',
    line: lineOf(route, `throw new Error('MARK_PAGE_THROW`),
  })
}

// Control for the pins below.
describe('vite', () => {
  test.each(builds)(
    'a throw in a split component maps to its line in the route file ($name)',
    (options) => expectThrowMapsToRouteFile('vite', options),
    timeout,
  )

  // Code the splitter leaves in the route module, and code it moves into the
  // module the route module and a chunk share, map back the same way.
  test.each([
    {
      name: 'the route module (an unsplit loader)',
      route: `${routeHead()}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({
  loader: () => {
    throw new Error('MARK_LOADER_THROW')
  },
  component: Page,
})
`,
      marker: 'MARK_LOADER_THROW',
    },
    {
      name: 'a function the loader and the split component share',
      route: `${routeHead()}import { label } from '../lib/label'
function fail(): never {
  throw new Error('MARK_SHARED_THROW ' + label)
}
function Page() {
  return <p>{typeof fail}</p>
}
export const Route = createFileRoute('/')({
  loader: () => fail(),
  component: Page,
})
`,
      marker: 'MARK_SHARED_THROW',
    },
  ])(
    'a throw in $name maps to its line in the route file',
    async ({ route: source, marker }) => {
      const app = await build({
        bundler: 'vite',
        env: 'client',
        minify: false,
        sourcemap: true,
        files: routeApp(source, {
          env: 'client',
          files: {
            'lib/label.ts': `export const label = 'MARK_LABEL'\n`,
            'entry.ts': `export * from './routes/index'\n`,
          },
        }),
      })
      const { result: stack } = await app.run(
        `try { entry.Route.options.loader() } catch (error) { return error.stack }`,
      )
      expect(stack).toMatch(marker)
      const { file, line } = originalFrameOf(app, stack as string) ?? {}
      expect({ file, line }).toEqual({
        file: 'routes/index.tsx',
        line: lineOf(source, `throw new Error('${marker}`),
      })
    },
    timeout,
  )

  // Devtools and error trackers show a minified variable by its original
  // name through the map's `names`. Source: the #8504 probe (Y-names).
  test(
    'a minified split component parameter keeps its name in the map',
    async () => {
      const source = `${routeHead()}function Page(props: { title?: string }) {
  return <p>{props.title ?? 'MARK_NAMED_PAGE'}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`
      const app = await build({
        bundler: 'vite',
        env: 'client',
        minify: true,
        sourcemap: true,
        files: routeApp(source, { env: 'client' }),
      })
      const chunk = app.chunks.find((candidate) =>
        candidate.code.includes('MARK_NAMED_PAGE'),
      )!
      // The minifier renamed the parameter.
      expect(chunk.code).not.toMatch(/\bprops\b/)
      const line = lineOf(source, 'function Page(props')
      const column = source.split('\n')[line - 1]!.indexOf('props')
      expect(
        namedSegments(chunk.map!)
          .filter(
            (segment) =>
              segment.name === 'props' &&
              segment.source.split('?')[0]!.endsWith('routes/index.tsx'),
          )
          .map((segment) => [segment.line, segment.column]),
      ).toContainEqual([line, column])
    },
    timeout,
  )
})

// Bug: unplugin's webpack and Rspack transform loaders drop the source map
// a plugin's `transform` returns when no earlier loader passed one in
// (`callback(null, res.code, map == null ? map : res.map || map)` in
// unplugin/dist/{webpack,rspack}/loaders/transform.mjs), and the router
// plugin's transform is the first loader of a route file. The bundler then
// maps the chunk to the code splitter's output instead of the route file.
// (On webpack the harness's own TypeScript loader composes the map it gets.)
// Source: oracle-gaps M1; upstream (unplugin), not the router plugin.
// Impact: stack traces, devtools and error trackers point at lines of the
// generated split module (here line 3 instead of line 5 of the route file).
describe.each(['rspack', 'webpack'] as const)('%s', (bundler) => {
  test.fails.each(builds)(
    'a throw in a split component maps to its line in the route file ($name)',
    (options) => expectThrowMapsToRouteFile(bundler, options),
    timeout,
  )
})
