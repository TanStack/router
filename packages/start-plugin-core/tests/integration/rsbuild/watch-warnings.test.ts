/**
 * Start's Rsbuild `build --watch`, the warnings of the modules a rebuild
 * keeps: Rsbuild prints, after each rebuild, the last compilation of every
 * compiler, and each report has a warning that still applies once (rule 4 of
 * the Rsbuild host: one current compilation carries it), whichever compilers
 * the rebuild ran and in whatever order they started.
 * Sources: review-hotspot3-impl-astra.md finding 3,
 * review-hotspot3-impl-gemini.md finding 1.
 */
import { describe, expect, test } from 'vitest'
import { StartBuildError } from '../../build-harness'
import { buildStart } from '../../build-start'
import { appManifest } from '../../package-layouts'
import { rsbuildRscLinks } from '../../start-plugins'
import { rsbuildEntries } from '../route-css-cases'
import { rscAppFiles } from '../rsc-warning-app'
import { printedWarnings } from './printed-warnings'
import { uiKit, uiKitFile } from './worker-warning-apps'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'

const timeout = 120_000

describe('rsbuild build --watch: a package only server code imports, a rebuild of the server alone', () => {
  // The server entry imports the package and `tick.ts`; the edit of
  // `tick.ts` builds the server compilation only.
  test(
    'every report has the package warning, once',
    async () => {
      const printed = printedWarnings()
      const build = await buildStart({
        bundler: 'rsbuild',
        packageJson: appManifest([uiKit]),
        files: {
          ...rsbuildEntries,
          ...uiKit.files,
          'src/routes/__root.tsx': `import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
          'src/tick.ts': `export const tick = 'MARK_TICK_0'\n`,
          'src/server-uses.ts': `import { tag } from 'ui-kit/a.js'\nimport { tick } from './tick'\nconsole.log(tag, tick)\n`,
          'src/server.ts': `import './server-uses'\n${rsbuildEntries['src/server.ts']}`,
        },
        rsbuildConfig: { plugins: [printed.plugin] },
        watchEdits: [
          { edits: { 'src/tick.ts': `export const tick = 'MARK_TICK_1'\n` } },
          { edits: { 'src/tick.ts': `export const tick = 'MARK_TICK_2'\n` } },
        ],
      })
      const edited = build.ssr.locate('MARK_TICK_2')
      expect([...edited.eager, ...edited.lazy].length).toBeGreaterThan(0)
      const counts = printed.counts(build.root, uiKitFile)
      expect(counts.length).toBeGreaterThanOrEqual(3)
      expect(counts.filter((count) => count !== 1)).toEqual([])
    },
    timeout,
  )
})

describe('rsbuild build --watch: an invalid custom server function id, a rebuild of the server alone', () => {
  // A server function only server code defines and calls, whose custom id
  // `generateFunctionId` refuses: every build of the server reports the
  // error (the session's own reports follow rule 4 too: one current
  // compilation carries each, nothing is reset at a compiler's `watchRun`).
  // Sources: design-hotspot3-merged.md "Rule 4, revised", KNOWN-BUGS
  // candidate 4.
  test(
    'every report has the error, once',
    async () => {
      const errors: Array<Array<string>> = []
      const recordErrors: RsbuildPlugin = {
        name: 'test:printed-errors',
        setup(api) {
          api.onAfterBuild(({ stats }) => {
            if (!stats) {
              return
            }
            const all = 'stats' in stats ? stats.stats : [stats]
            errors.push(
              all.flatMap((one) =>
                (one.toJson({ all: false, errors: true }).errors ?? []).map(
                  (e) => e.message,
                ),
              ),
            )
          })
        },
      }
      const build = buildStart({
        bundler: 'rsbuild',
        start: {
          serverFns: { generateFunctionId: () => 'MARK_BAD/ID' },
        } as never,
        files: {
          ...rsbuildEntries,
          'src/routes/__root.tsx': `import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
          'src/tick.ts': `export const tick = 'MARK_TICK_0'\n`,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const serverOnly = createServerFn().handler(async () => 'MARK_FN')
`,
          'src/server-uses.ts': `import { serverOnly } from './fns'\nimport { tick } from './tick'\nconsole.log(serverOnly, tick)\n`,
          'src/server.ts': `import './server-uses'\n${rsbuildEntries['src/server.ts']}`,
        },
        rsbuildConfig: { plugins: [recordErrors] },
        watchEdits: [
          { edits: { 'src/tick.ts': `export const tick = 'MARK_TICK_1'\n` } },
          { edits: { 'src/tick.ts': `export const tick = 'MARK_TICK_2'\n` } },
        ],
      })
      // (the last rebuild fails on the id too)
      const error = await build.then(
        () => expect.fail('the rebuild succeeded'),
        (e: unknown) => e,
      )
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      expect(
        error.diagnostics.some(
          ({ severity, text }) =>
            severity === 'error' && text.includes('MARK_BAD/ID'),
        ),
        "the last edit's rebuild reports the id",
      ).toBe(true)
      const counts = errors.map(
        (report) => report.filter((m) => m.includes('MARK_BAD/ID')).length,
      )
      expect(counts.length).toBeGreaterThanOrEqual(3)
      expect(counts.filter((count) => count !== 1)).toEqual([])
    },
    timeout,
  )
})

describe('rsbuild build --watch with RSC: a package only server code imports', () => {
  const files = {
    ...rscAppFiles,
    ...uiKit.files,
    'src/entry.ts': `export {}\n`,
    'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
    'src/tick.ts': `export const tick = 'MARK_TICK_0'\n`,
    'src/fn.ts': `import { createServerFn } from '@tanstack/react-start'
import { tag } from 'ui-kit/a.js'
import { tick } from './tick'
export const read = createServerFn().handler(() => tag() + tick)
`,
    'src/routes/index.tsx': page('MARK_PAGE_0'),
  }
  function page(mark: string) {
    return `import { createFileRoute } from '@tanstack/react-router'
import { read } from '../fn'
export const Route = createFileRoute('/')({
  loader: async () => ({ value: await read() }),
  component: Home,
})
function Home() {
  return <main>${mark}{Route.useLoaderData().value}</main>
}
`
  }
  const watch = (
    plugins: Array<RsbuildPlugin>,
    edits: Array<Record<string, string>>,
  ) =>
    buildStart({
      bundler: 'rsbuild',
      packageJson: appManifest([uiKit]),
      entry: 'src/entry.ts',
      symlinks: rsbuildRscLinks(),
      start: { rsc: { enabled: true } } as never,
      files,
      rsbuildConfig: { plugins },
      watchEdits: edits.map((one) => ({ edits: one })),
    })

  // Control: both compilers build after each edit.
  test(
    'edits of the page: every report has the package warning, once',
    async () => {
      const printed = printedWarnings()
      const build = await watch(
        [printed.plugin],
        [
          { 'src/routes/index.tsx': page('MARK_PAGE_1') },
          { 'src/routes/index.tsx': page('MARK_PAGE_2') },
        ],
      )
      const counts = printed.counts(build.root, uiKitFile)
      expect(counts.length).toBeGreaterThanOrEqual(3)
      expect(counts.filter((count) => count !== 1)).toEqual([])
    },
    timeout,
  )

  // With RSC the two compilers start beside each other: here an app plugin
  // of the client compiler makes its `watchRun` take longer, so the server's
  // compilation has begun when the client's starts.
  test(
    "the server's compilation begins before the client's: every report has the package warning, once",
    async () => {
      const printed = printedWarnings()
      const slowClient: RsbuildPlugin = {
        name: 'app:slow-client',
        setup(api) {
          api.modifyRspackConfig((config, { environment }) => {
            if (environment.name === 'client') {
              config.plugins.push({
                apply(compiler: Rspack.Compiler) {
                  compiler.hooks.watchRun.tapPromise(
                    { name: 'app:slow-client', stage: -10 },
                    () => new Promise((resolve) => setTimeout(resolve, 20)),
                  )
                },
              })
            }
          })
        },
      }
      const build = await watch(
        [slowClient, printed.plugin],
        [
          { 'src/tick.ts': `export const tick = 'MARK_TICK_1'\n` },
          { 'src/tick.ts': `export const tick = 'MARK_TICK_2'\n` },
        ],
      )
      const counts = printed.counts(build.root, uiKitFile)
      expect(counts.length).toBeGreaterThanOrEqual(3)
      expect(counts.filter((count) => count !== 1)).toEqual([])
    },
    timeout,
  )
})
