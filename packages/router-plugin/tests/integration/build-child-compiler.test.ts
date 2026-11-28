/**
 * Route modules a webpack or Rspack child compiler builds: what a worker or
 * service-worker plugin does (`worker-loader`, `worker-rspack-loader`,
 * workbox's `InjectManifest`): `compilation.createChildCompiler` with an
 * entry of its own, run during the app's compilation, its assets emitted
 * with the app's. The child takes the app's module rules, so its route
 * modules are split as the app's are: a route component the child reaches
 * through the route tree is a chunk of the child's, in a production build
 * and after an edit or a new route in watch mode.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, onTestFinished, test } from 'vitest'
import { createAppDirectory } from '@tanstack/compiler-test-utils/app-directory'
import { build, routeApp, routeHead } from '../build-harness'
import { until } from '../generator-watch-session'

const timeout = 60_000

/**
 * The app's own plugin: builds `worker` in a child compiler of the app's
 * compilation, emitted as `worker.js` beside chunks named `worker-*.js`
 * (the bundler's public plugin API, as a worker plugin uses it).
 * The child's files are the app's to watch, as a worker plugin forwards
 * them; `childPlugins` are the child compiler's own.
 */
function workerPlugin(
  worker: string,
  childPlugins: (compiler: any) => Array<unknown> = () => [],
) {
  return {
    apply(compiler: any) {
      compiler.hooks.make.tapPromise('app:worker', (compilation: any) => {
        const child = compilation.createChildCompiler(
          'app-worker',
          {
            filename: 'worker.js',
            chunkFilename: 'worker-[id].js',
          },
          [
            new compiler.webpack.EntryPlugin(compiler.context, worker, {
              name: 'worker',
            }),
            new compiler.webpack.webworker.WebWorkerTemplatePlugin(),
            ...childPlugins(compiler),
          ],
        )
        return new Promise<void>((resolve, reject) => {
          child.runAsChild(
            (error: Error | null, _entries: unknown, childCompilation: any) => {
              if (error) {
                reject(error)
                return
              }
              for (const kind of [
                'fileDependencies',
                'contextDependencies',
                'missingDependencies',
              ]) {
                for (const file of childCompilation[kind]) {
                  compilation[kind].add(file)
                }
              }
              resolve()
            },
          )
        })
      })
    },
  }
}

/**
 * The assets of the worker in `outDir` that contain `marker`: `entry` (the
 * worker's entry asset) or `chunk` (another asset of the worker).
 */
async function workerAssetsWith(outDir: string, marker: string) {
  const holding: Array<string> = []
  for (const file of await readdir(outDir).catch(() => [])) {
    if (
      file.startsWith('worker') &&
      (await readFile(path.join(outDir, file), 'utf8')).includes(marker)
    ) {
      holding.push(file === 'worker.js' ? 'entry' : 'chunk')
    }
  }
  return holding
}

describe.each(['webpack', 'rspack'] as const)('%s', (bundler) => {
  test(
    'a production build splits the route component the child compiler reaches',
    async () => {
      const result = await build({
        bundler,
        files: routeApp(
          `${routeHead()}export const Route = createFileRoute('/')({ component: () => <p>MARK_INDEX</p> })\n`,
          {
            files: {
              'worker.ts': `import { routeTree } from './routeTree.gen'
self.onmessage = () => self.postMessage(Object.keys(routeTree.children ?? {}))
`,
            },
          },
        ),
        configure: (options) => {
          ;(options.plugins as Array<unknown>).push(workerPlugin('./worker.ts'))
        },
      })
      expect(await workerAssetsWith(result.outDir, 'MARK_INDEX')).toEqual([
        'chunk',
      ])
    },
    timeout,
  )

  test(
    'in watch mode an edited route and a new route are split in the child compiler',
    async () => {
      const root = await createAppDirectory(__dirname, '.child-compiler-')
      let close: () => Promise<unknown> = () => Promise.resolve()
      onTestFinished(async () => {
        await close()
        await rm(root, { recursive: true, force: true })
      })
      const file = (relative: string) => path.join(root, relative)
      // Route files without JSX: the bundler compiles them without a loader
      const page = (id: string, marker: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('${id}')({ component: () => '${marker}' })
`
      await mkdir(file('routes'), { recursive: true })
      // An app package of its own: the generated route tree imports route
      // files without extensions
      await writeFile(file('package.json'), '{}\n')
      await writeFile(file('app.js'), 'export const app = true\n')
      await writeFile(
        file('worker.js'),
        `import { routeTree } from './routeTree.gen.js'
self.onmessage = () => self.postMessage(Object.keys(routeTree.children ?? {}))
`,
      )
      await writeFile(
        file('routes/__root.js'),
        `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
      )
      await writeFile(file('routes/page.js'), page('/page', 'MARK_PAGE'))

      const tanstackRouter =
        bundler === 'webpack'
          ? (await import('../../src/webpack')).tanstackRouter
          : (await import('../../src/rspack')).tanstackRouter
      const options = {
        context: root,
        mode: 'development',
        devtool: false,
        target: 'web',
        entry: './app.js',
        output: { path: file('dist'), filename: 'app.js' },
        infrastructureLogging: { level: 'none' },
        stats: 'none',
        plugins: [
          tanstackRouter({
            target: 'react',
            routesDirectory: file('routes'),
            generatedRouteTree: file('routeTree.gen.js'),
            disableTypes: true,
            disableLogging: true,
            autoCodeSplitting: true,
            codeSplittingOptions: { addHmr: false },
          }),
          // (nothing runs the bundle; a child compiler takes no `externals`)
          workerPlugin('./worker.js', (c) => [
            new c.webpack.ExternalsPlugin('commonjs', [/^@tanstack\//]),
          ]),
        ],
      }
      const compiler: any =
        bundler === 'webpack'
          ? (await import('webpack')).default(options as any)
          : (await import('@rsbuild/core')).rspack(options as any)
      const errors: Array<string> = []
      let built = () => {}
      let nextBuild = new Promise<void>((resolve) => {
        built = resolve
      })
      const watching = compiler.watch(
        { aggregateTimeout: 50 },
        (error: Error | null, stats: any) => {
          if (error) {
            errors.push(String(error))
          } else if (stats.hasErrors()) {
            const { errors: own, children } = stats.toJson({
              all: false,
              errors: true,
              children: true,
            })
            for (const entry of [
              ...own,
              ...children.flatMap((child: any) => child.errors),
            ]) {
              errors.push(entry.message)
            }
          }
          built()
          nextBuild = new Promise<void>((resolve) => {
            built = resolve
          })
        },
      )
      close = () =>
        new Promise((resolve) => {
          close = () => Promise.resolve()
          watching.close(resolve)
        })

      /** Waits for a worker asset with `marker`, then gives the worker's assets with it. */
      const placementOf = async (marker: string) => {
        await until(
          async () => (await workerAssetsWith(file('dist'), marker)).length > 0,
          () => `no worker asset with ${marker} (${errors.join('\n')})`,
          () => nextBuild,
        )
        return workerAssetsWith(file('dist'), marker)
      }

      expect(await placementOf('MARK_PAGE')).toEqual(['chunk'])
      await writeFile(file('routes/page.js'), page('/page', 'MARK_EDITED'))
      expect(await placementOf('MARK_EDITED')).toEqual(['chunk'])
      await writeFile(file('routes/new.js'), page('/new', 'MARK_NEW'))
      expect(await placementOf('MARK_NEW')).toEqual(['chunk'])
      expect(errors).toEqual([])
    },
    timeout,
  )
})
