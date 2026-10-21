/**
 * Runtime regression, outside the compiler corpus (SPEC §1.2 runtime-bugs
 * ruling; SYNTHESIS B-runtime R/integration/known-bugs-code-splitter-ssr-builds
 * .test.ts:419 and :435, N22): a split loader is called as a method of its
 * chunk's module namespace because router-core's `lazyFn` calls
 * `imported[key](...args)`, so its `this` is the chunk's exports. The cause
 * is the router runtime, not the compiler: a rewrite of the compiler need
 * not compensate for it, and the fix belongs in router-core's `lazyFn`
 * (call the export without a receiver). Kept here, with its control, as a
 * regression of that runtime path through a real build. Moved from
 * ../known-bugs-code-splitter-ssr-builds.test.ts.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, head, routeApp } from '../../build-harness'
import type { CodeSplitGroupings } from '../../build-harness'

describe('`this` in split callbacks', () => {
  /**
   * Builds an app whose `/` route has `loader` (a function reading `this`),
   * with the given groupings, loads `/` with a real router and returns the
   * route's loader data, whether the loader was split, and whether the
   * build warned naming the route file and the option.
   */
  async function loadWithLoader(loader: string, groupings: CodeSplitGroupings) {
    const app = await build({
      bundler: 'vite',
      env: 'ssr',
      minify: false,
      files: routeApp(
        `${head}export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>index</p>,
})`,
        {
          files: {
            'entry.ts': `import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export async function load() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return router.state.matches.at(-1)?.loaderData
}`,
          },
        },
      ),
      pluginOptions: { codeSplittingOptions: { defaultBehavior: groupings } },
    })
    return {
      data: (await app.run('return await entry.load()')).result,
      split: app.where('MARK_THIS') === 'lazy',
      reported:
        findDiagnostics([...app.warnings, ...app.consoleMessages], {
          file: 'routes/index.tsx',
          root: app.root,
          names: ['loader'],
        }).length > 0,
    }
  }

  const readsThis = `function () {
  return this === undefined ? 'MARK_THIS none' : 'MARK_THIS ' + Object.keys(this).join()
}`

  // Control for the pin below: the router calls an unsplit loader without a
  // `this`.
  test('an unsplit loader is called without a `this`', async () => {
    expect(await loadWithLoader(readsThis, [['component']])).toEqual({
      data: 'MARK_THIS none',
      split: false,
      reported: false,
    })
  }, 60_000)

  // Bug: a split loader is called as a method of its chunk's module
  // namespace (`lazyFn` calls `imported[key](...args)`), so its `this` is
  // the chunk's exports, where the router calls an unsplit loader without a
  // `this`. Source: #8688. A compiler that leaves such a loader unsplit
  // warns naming the file and the option (J2.8); either way the loader runs
  // through the real router with the result the unsplit route gives.
  // Impact: a loader that reads `this` behaves differently once split,
  // without any diagnostic.
  test.fails(
    'a split loader sees the same `this` as an unsplit one',
    async () => {
      const { data, split, reported } = await loadWithLoader(readsThis, [
        ['loader'],
        ['component'],
      ])
      expect(split || reported).toBe(true)
      expect(data).toBe('MARK_THIS none')
    },
    60_000,
  )
})
