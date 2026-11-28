/**
 * Persistent bundler caches (webpack's and Rspack's filesystem caches,
 * Rsbuild's `performance.buildCache`) rebuild a split route as the first
 * build did: the module state a loader and its split component share
 * initialises once and both see one instance, on a fully cached rebuild and
 * on a rebuild after an edit of an unrelated file (SPEC G3, G4, J2.4; §9:
 * a regression test, not a pin). A rebuild after a split configuration
 * edit the bundler's cache does not see splits as a fresh build does
 * (astra-r4-factcheck-router.md B1).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'
import { describe, expect, test } from 'vitest'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { buildWithRsbuild, routeApp, routeHead } from '../build-harness'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 120_000

/** The apps live next to the other harness apps, where imports resolve. */
const appsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * A route whose loader and split component share module state that counts
 * its own evaluations; the entry also imports an unrelated module.
 */
const files = (unrelatedVersion: number) =>
  routeApp(
    `${routeHead()}const shared = {
  inits: ((globalThis as any).__inits = ((globalThis as any).__inits ?? 0) + 1),
}
function Page() {
  return <p>{'MARK_COMPONENT ' + shared.inits}</p>
}
export const Route = createFileRoute('/')({
  loader: () => shared,
  component: Page,
})
`,
    {
      env: 'client',
      files: {
        'lib/unrelated.ts': `export const version = ${unrelatedVersion}\n`,
      },
    },
  )

/** The entry of `routeApp`, also importing the unrelated module. */
const withUnrelatedImport = (entry: string) =>
  `import './lib/unrelated'\n${entry}`

const script = `await entry.mount(entry.Route.options.component)
return { inits: globalThis.__inits, loader: entry.Route.options.loader().inits }`

/** The outcome every build (cold, cached, after an edit) must give. */
async function expectOneSharedInstance(app: BuildResult) {
  const run = await app.run(script)
  expect({
    placement: app.where('MARK_COMPONENT'),
    html: run.html,
    ...(run.result as object),
  }).toEqual({
    placement: 'lazy',
    html: '<div id="root"><p>MARK_COMPONENT 1</p></div>',
    inits: 1,
    loader: 1,
  })
}

/** The app files of the first build (version 1 of the unrelated module). */
function initialFiles() {
  const initial = files(1)
  return { ...initial, 'entry.ts': withUnrelatedImport(initial['entry.ts']!) }
}

/**
 * A build of an app with the bundler's persistent filesystem cache in
 * `cacheDirectory` (shared by the builds given the same one).
 */
async function bundleWithCache(
  app: Awaited<ReturnType<typeof createApp>>,
  bundler: 'rspack' | 'webpack',
  cacheDirectory: string,
  outDir: string,
  codeSplittingOptions: Record<string, unknown> = {},
) {
  const { tanstackRouter } = await import(`../../src/${bundler}`)
  return app.bundle({
    bundler,
    env: 'client',
    outDir,
    plugin: ({ root }) =>
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: path.join(root, 'routes'),
        generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
        codeSplittingOptions: { addHmr: false, ...codeSplittingOptions },
      }),
    configure: (options) => {
      options.cache =
        bundler === 'webpack'
          ? { type: 'filesystem', cacheDirectory }
          : {
              type: 'persistent',
              storage: { type: 'filesystem', directory: cacheDirectory },
            }
    },
  })
}

describe.each(['rspack', 'webpack'] as const)('%s', (bundler) => {
  test(
    'with a persistent filesystem cache, a cached rebuild and a rebuild after an unrelated edit keep one instance of the shared state',
    async () => {
      const app = await closeAtEnd(
        () =>
          createApp({
            dir: appsDir,
            prefix: `.build-cache-${bundler}-`,
            files: initialFiles(),
          }),
        (opened) => opened.dispose(),
      )
      const cacheDirectory = path.join(app.root, '.bundler-cache')
      const bundle = (outDir: string) =>
        bundleWithCache(app, bundler, cacheDirectory, outDir)
      await expectOneSharedInstance(await bundle('dist-cold'))
      await expectOneSharedInstance(await bundle('dist-cached'))
      await writeFile(
        path.join(app.root, 'lib/unrelated.ts'),
        files(2)['lib/unrelated.ts']!,
      )
      await expectOneSharedInstance(await bundle('dist-edited'))
    },
    timeout,
  )

  // the bundler's cache does not see a split configuration it is not told
  // about (raw webpack without `buildDependencies`, options computed from
  // the environment, `tsr.config.json`): the plans it restores are checked
  // against the configuration of this build
  test(
    'with a persistent filesystem cache, a rebuild after a grouping edit splits as a build with a fresh cache does',
    async () => {
      const app = await closeAtEnd(
        () =>
          createApp({
            dir: appsDir,
            prefix: `.build-cache-groups-${bundler}-`,
            files: routeApp(
              `${routeHead()}function Page() {
  return <p>MARK_COMPONENT</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'MARK_LOADER',
  component: Page,
})
`,
              { env: 'client' },
            ),
          }),
        (opened) => opened.dispose(),
      )
      const regrouped = { defaultBehavior: [['loader'], ['component']] }
      const outcome = async (build: Promise<BuildResult>) => {
        const app = await build
        const run = await app.run(`return await entry.Route.options.loader()`)
        return {
          loader: app.where('MARK_LOADER'),
          component: app.where('MARK_COMPONENT'),
          result: run.result,
        }
      }
      const cacheDirectory = path.join(app.root, '.bundler-cache')
      expect(
        await outcome(
          bundleWithCache(app, bundler, cacheDirectory, 'dist-cold', {
            defaultBehavior: [['component']],
          }),
        ),
      ).toEqual({ loader: 'eager', component: 'lazy', result: 'MARK_LOADER' })
      const warm = await outcome(
        bundleWithCache(app, bundler, cacheDirectory, 'dist-warm', regrouped),
      )
      const fresh = await outcome(
        bundleWithCache(
          app,
          bundler,
          path.join(app.root, '.bundler-cache-fresh'),
          'dist-fresh',
          regrouped,
        ),
      )
      expect(fresh).toEqual({
        loader: 'lazy',
        component: 'lazy',
        result: 'MARK_LOADER',
      })
      expect(warm).toEqual(fresh)
    },
    timeout,
  )
})

test(
  'with Rsbuild build cache on, a cached rebuild and a rebuild after an unrelated edit keep one instance of the shared state',
  async () => {
    const app = await closeAtEnd(
      () =>
        createApp({
          dir: appsDir,
          prefix: '.build-cache-rsbuild-',
          files: initialFiles(),
        }),
      (opened) => opened.dispose(),
    )
    const cacheDirectory = path.join(app.root, '.rsbuild-cache')
    const bundle = (distDir: string) =>
      buildWithRsbuild({
        root: app.root,
        files: {},
        rsbuildConfig: {
          output: { distPath: { root: distDir } },
          performance: { buildCache: { cacheDirectory } },
        },
      })
    await expectOneSharedInstance(await bundle('dist-cold'))
    await expectOneSharedInstance(await bundle('dist-cached'))
    await writeFile(
      path.join(app.root, 'lib/unrelated.ts'),
      files(2)['lib/unrelated.ts']!,
    )
    await expectOneSharedInstance(await bundle('dist-edited'))
  },
  timeout,
)
