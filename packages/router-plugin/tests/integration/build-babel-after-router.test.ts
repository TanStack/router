/**
 * A Babel plugin after the router plugin in a real Vite build (React
 * Compiler's setup: `@rolldown/plugin-babel`, which parses TypeScript and
 * JSX, after `tanstackRouter()`): it parses every module the code splitter
 * emits, so those must be modules Babel's parser accepts. A type-only export
 * of a type import the splitter removed (`import { fetchThing, type Thing }`
 * with `export type { Thing }`) is not ("Export 'Thing' is not defined"):
 * the splitter removes type-only exports, as `main` does
 * (`stripTypeExports`). Dev-server twin with more shapes:
 * tests/code-splitter-type-exports.test.ts.
 */
import { describe, expect, test } from 'vitest'
import babel from '@rolldown/plugin-babel'
// @ts-expect-error -- the preset ships no type declarations
import typescript from '@babel/preset-typescript'
import { tanstackRouter } from '../../src/vite'
import { build, routeApp, routeHead } from '../build-harness'
import type { BuildEnv } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 60_000

const route = `${routeHead()}import { fetchThing, type Thing } from '../thing'
export type { Thing }
export const Route = createFileRoute('/')({
  loader: (): Thing => fetchThing(),
  component: () => <p>MARK_PAGE</p>,
})
`

const thing = `export const fetchThing = () => 'MARK_THING_DATA'
export type Thing = string
`

/** What the built app gives: the rendered component and the loader's data. */
const scripts: Record<BuildEnv, string> = {
  ssr: `return [await entry.render(entry.Route.options.component), entry.Route.options.loader()]`,
  client: `await entry.mount(entry.Route.options.component)
return [document.getElementById('root').innerHTML, entry.Route.options.loader()]`,
}

describe('vite', () => {
  test.each<BuildEnv>(['client', 'ssr'])(
    'a route exporting a type it imports inline builds through a Babel plugin after the router plugin (%s)',
    async (env) => {
      const app = await build({
        bundler: 'vite',
        env,
        minify: false,
        files: routeApp(route, { env, files: { 'thing.ts': thing } }),
        routerPlugins: (config) => [
          tanstackRouter(config),
          babel({
            presets: [[typescript, { allExtensions: true, isTSX: true }]],
          }),
        ],
      })
      try {
        const { result } = await app.run(scripts[env])
        expect(result).toEqual([
          expect.stringContaining('MARK_PAGE'),
          'MARK_THING_DATA',
        ])
      } finally {
        await app.dispose()
      }
    },
    timeout,
  )
})
