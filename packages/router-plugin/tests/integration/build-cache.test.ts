/**
 * Persistent bundler caches (webpack's and Rspack's filesystem caches,
 * Rsbuild's `performance.buildCache`) rebuild a split route as the first
 * build did: the module state a loader and its split component share
 * initialises once and both see one instance, on a fully cached rebuild and
 * on a rebuild after an edit of an unrelated file (SPEC G3, G4, J2.4; §9:
 * a regression test, not a pin).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, onTestFinished, test } from 'vitest'
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

describe.each(['rspack', 'webpack'] as const)('%s', (bundler) => {
  test(
    'with a persistent filesystem cache, a cached rebuild and a rebuild after an unrelated edit keep one instance of the shared state',
    async () => {
      const { tanstackRouter } = await import(`../../src/${bundler}`)
      const app = await createApp({
        dir: appsDir,
        prefix: `.build-cache-${bundler}-`,
        registerCleanup: onTestFinished,
        files: initialFiles(),
      })
      const cacheDirectory = path.join(app.root, '.bundler-cache')
      const bundle = (outDir: string) =>
        app.bundle({
          bundler,
          env: 'client',
          outDir,
          plugin: ({ root }) =>
            tanstackRouter({
              target: 'react',
              autoCodeSplitting: true,
              routesDirectory: path.join(root, 'routes'),
              generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
              codeSplittingOptions: { addHmr: false },
            }),
          configure: (options) => {
            if (bundler === 'webpack') {
              options.cache = { type: 'filesystem', cacheDirectory }
            } else {
              options.cache = true
              options.experiments = {
                ...(options.experiments as Record<string, unknown>),
                cache: {
                  type: 'persistent',
                  storage: { type: 'filesystem', directory: cacheDirectory },
                },
              }
            }
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
})

test(
  'with Rsbuild build cache on, a cached rebuild and a rebuild after an unrelated edit keep one instance of the shared state',
  async () => {
    const app = await createApp({
      dir: appsDir,
      prefix: '.build-cache-rsbuild-',
      registerCleanup: onTestFinished,
      files: initialFiles(),
    })
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
