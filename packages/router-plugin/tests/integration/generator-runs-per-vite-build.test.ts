/**
 * How often the route generator runs in a Vite build whose environments
 * share the app's plugins (`builder.sharedPlugins`, as Start sets it): Vite
 * resolves the config once at the top and once per environment, and hands
 * the top-level plugin objects to each environment's resolution. A build
 * whose plugins come from its config file generates the route tree once,
 * with `buildApp`, by hand and in watch mode; a dev server once. A build
 * never reuses an earlier build's routes: two builds in one process, with a
 * route file added between them, each generate the tree of their own files,
 * whether the config file gives each build new plugin objects or a program
 * passes the same ones inline. A watch build follows route files created
 * while it watches, and no longer once its watchers closed. Vite 6 and 7 are aliased packages
 * (`@tanstack/compiler-vite-versions`); the suite's own is Vite 8.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { viteVersions } from '@tanstack/compiler-vite-versions'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { tanstackRouter } from '../../src/vite'
import { head, rootRoute } from '../build-harness'
import type { GeneratorPlugin } from '@tanstack/router-generator'
import type * as ViteModule from 'vite'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

const versions = [
  { major: 8, load: () => import('vite') },
  ...viteVersions,
] as const

/** The Vite API these tests use, as every version has it. */
type Vite = Pick<typeof ViteModule, 'createBuilder' | 'createServer'>

const route = (path: string) =>
  `${head}export const Route = createFileRoute('${path}')({})\n`

/** What `builder.build` returns in watch mode, as every version has it. */
interface Watcher {
  on: (
    event: 'event',
    listener: (event: { code: string; error?: Error }) => void,
  ) => void
  close: () => Promise<void>
}

/**
 * Builds every environment of `builder` in watch mode (closed when the test
 * finishes, or by `close`); `ended(env)` resolves at the next build of `env`
 * that ends, and rejects when that build fails (as the first builds do).
 */
async function watchBuild(builder: ViteModule.ViteBuilder) {
  const waiting = new Map<
    string,
    Array<{ resolve: () => void; reject: (error: Error) => void }>
  >()
  const watchers: Array<Watcher> = []
  const close = async () => {
    await Promise.all(watchers.map((watcher) => watcher.close()))
  }
  const watch = async (
    name: string,
    environment: ViteModule.BuildEnvironment,
  ) => {
    // (also closed by `close`: a watcher closes once)
    const watcher = await closeAtEnd(
      async () => (await builder.build(environment)) as unknown as Watcher,
    )
    watchers.push(watcher)
    watcher.on('event', (event) => {
      if (event.code === 'END' || event.code === 'ERROR') {
        for (const { resolve, reject } of waiting.get(name)?.splice(0) ?? []) {
          if (event.code === 'END') {
            resolve()
          } else {
            reject(
              new Error(`the ${name} watch build failed`, {
                cause: event.error,
              }),
            )
          }
        }
      }
    })
  }
  const ended = (name: string) =>
    new Promise<void>((resolve, reject) => {
      waiting.set(name, [...(waiting.get(name) ?? []), { resolve, reject }])
    })
  for (const [name, environment] of Object.entries(builder.environments)) {
    const first = ended(name)
    await watch(name, environment)
    await first
  }
  return { ended, close }
}

/** The text of the files of `dir` (recursively). */
async function output(dir: string): Promise<string> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const texts = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        readFile(path.join(entry.parentPath, entry.name), 'utf8'),
      ),
  )
  return texts.join('\n')
}

/** The routes a generated tree file declares (`'/'`, `'/about'`). */
async function treeRoutes(root: string) {
  const tree = await readFile(path.join(root, 'routeTree.gen.ts'), 'utf8')
  // (each route's path is in its definition and in the module declaration)
  return [
    ...new Set(Array.from(tree.matchAll(/^\s+path: '([^']*)'/gm), (m) => m[1])),
  ].sort()
}

/**
 * The plugin objects of each config file evaluation, by app root: the file
 * calls the app's factory, as an app's `vite.config.ts` calls
 * `tanstackRouter()` each time Vite loads it.
 */
const configFactories = new Map<string, () => ViteModule.InlineConfig>()
;(globalThis as Record<string, unknown>).__generatorRunsConfig = configFactories

/**
 * An app with an index route, and a generator plugin counting the
 * generations that built the route tree (`onRouteTreeChanged`).
 */
async function routerApp(major: number) {
  const app = await closeAtEnd(
    () =>
      createApp({
        dir: harnessDir,
        prefix: `.generator-runs-vite${major}-`,
        packageJson: { type: 'module' },
        files: {
          'routes/__root.tsx': rootRoute,
          'routes/index.tsx': route('/'),
          'entry.ts': `export { routeTree } from './routeTree.gen'\n`,
          'vite.config.mjs': '',
        },
      }),
    (opened) => opened.dispose(),
  )
  const configFile = path.join(app.root, 'vite.config.mjs')
  await writeFile(
    configFile,
    `export default globalThis.__generatorRunsConfig.get(${JSON.stringify(app.root)})()\n`,
  )
  let generations = 0
  const counter: GeneratorPlugin = {
    name: 'test:generations',
    onRouteTreeChanged: () => {
      generations++
    },
  }
  const plugins = () => [
    tanstackRouter({
      target: 'react',
      routesDirectory: path.join(app.root, 'routes'),
      generatedRouteTree: path.join(app.root, 'routeTree.gen.ts'),
      plugins: [counter],
    }),
  ]
  configFactories.set(app.root, () => ({ plugins: plugins() }))
  onTestFinished(() => {
    configFactories.delete(app.root)
  })
  /** The build's config: client and SSR environments sharing the plugins. */
  const buildConfig = (
    extra: ViteModule.InlineConfig = {},
  ): ViteModule.InlineConfig => ({
    root: app.root,
    configFile,
    logLevel: 'silent',
    builder: { sharedPlugins: true },
    environments: {
      client: {
        build: {
          outDir: 'dist/client',
          rollupOptions: { input: path.join(app.root, 'entry.ts') },
        },
      },
      ssr: {
        build: { outDir: 'dist/ssr', ssr: path.join(app.root, 'entry.ts') },
      },
    },
    build: { rollupOptions: { external: [/^@tanstack\//] } },
    ...extra,
  })
  return {
    root: app.root,
    configFile,
    plugins,
    buildConfig,
    generations: () => generations,
  }
}

describe.each(versions)('Vite $major', ({ major, load }) => {
  const vite = async () => (await load()) as unknown as Vite

  test('a build whose config file gives the plugins generates the route tree once', async () => {
    const { createBuilder } = await vite()
    const app = await routerApp(major)
    await (await createBuilder(app.buildConfig())).buildApp()
    expect(app.generations()).toBe(1)
    expect(await treeRoutes(app.root)).toEqual(['/'])
  })

  test('environments built by hand are one build: one generation', async () => {
    const { createBuilder } = await vite()
    const app = await routerApp(major)
    const builder = await createBuilder(app.buildConfig())
    await builder.build(builder.environments.client!)
    await builder.build(builder.environments.ssr!)
    expect(app.generations()).toBe(1)
  })

  test('a watch build generates the route tree once before its first builds', async () => {
    const { createBuilder } = await vite()
    const app = await routerApp(major)
    const builder = await createBuilder(
      app.buildConfig({
        build: { watch: {}, rollupOptions: { external: [/^@tanstack\//] } },
      }),
    )
    for (const environment of Object.values(builder.environments)) {
      const watcher = await closeAtEnd(
        async () => (await builder.build(environment)) as unknown as Watcher,
      )
      await new Promise<void>((resolve, reject) => {
        watcher.on('event', (event) => {
          if (event.code === 'END') {
            resolve()
          } else if (event.code === 'ERROR') {
            reject(new Error(`the ${environment.name} watch build failed`))
          }
        })
      })
    }
    expect(app.generations()).toBe(1)
    expect(await treeRoutes(app.root)).toEqual(['/'])
  })

  // (Vite's watcher reports the files of the
  // bundle only: the created route file never joined the tree, not even at
  // a later rebuild). The first row then closes the watchers: a route file
  // created afterwards joins no tree.
  test.each([
    {
      plugins: 'the config file',
      watch: 'the top level',
      inline: false,
      closing: ', and no longer once its watchers closed',
    },
    {
      plugins: 'the config file',
      watch: 'each environment',
      inline: false,
      closing: '',
    },
    {
      plugins: 'inline plugins',
      watch: 'the top level',
      inline: true,
      closing: '',
    },
  ])(
    'a watch build with $plugins, watching at $watch, follows a route file created while it watches$closing',
    async ({ watch, inline, closing }) => {
      const { createBuilder } = await vite()
      const app = await routerApp(major)
      const config = app.buildConfig({
        build: {
          ...(watch === 'the top level' && { watch: {} }),
          rollupOptions: { external: [/^@tanstack\//] },
        },
        ...(inline && { configFile: false, plugins: app.plugins() }),
      })
      if (watch === 'each environment') {
        for (const environment of Object.values(config.environments!)) {
          environment.build!.watch = {}
        }
      }
      const { ended, close } = await watchBuild(await createBuilder(config))
      if (!inline) {
        expect(app.generations()).toBe(1)
      }
      const rebuilt = Promise.all([ended('client'), ended('ssr')])
      const written = Date.now()
      await writeFile(
        path.join(app.root, 'routes/later.tsx'),
        `${head}export const Route = createFileRoute('/later')({ loader: () => 'MARK_LATER' })\n`,
      )
      // (bounded: without a rebuild, the tree and output below tell)
      await Promise.race([
        rebuilt,
        new Promise((resolve) => setTimeout(resolve, 20_000)),
      ])
      const reaction = Date.now() - written
      expect(await treeRoutes(app.root)).toEqual(['/', '/later'])
      expect(await output(path.join(app.root, 'dist/client'))).toContain(
        'MARK_LATER',
      )
      expect(await output(path.join(app.root, 'dist/ssr'))).toContain(
        'MARK_LATER',
      )
      if (!closing) {
        return
      }
      await close()
      await writeFile(
        path.join(app.root, 'routes/closed.tsx'),
        route('/closed'),
      )
      // Nothing reacting cannot be awaited: watched at least three times as
      // long as the open watchers took to rebuild the route above
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(1_000, 3 * reaction)),
      )
      expect(await treeRoutes(app.root)).toEqual(['/', '/later'])
    },
  )

  test('a dev server generates the route tree once', async () => {
    const { createServer } = await vite()
    const app = await routerApp(major)
    await closeAtEnd(() =>
      createServer({
        root: app.root,
        configFile: app.configFile,
        logLevel: 'silent',
        server: { middlewareMode: true, ws: false },
      }),
    )
    expect(app.generations()).toBe(1)
  })

  test('a second build from the config file generates the routes added since the first', async () => {
    const { createBuilder } = await vite()
    const app = await routerApp(major)
    await (await createBuilder(app.buildConfig())).buildApp()
    await writeFile(path.join(app.root, 'routes/about.tsx'), route('/about'))
    await (await createBuilder(app.buildConfig())).buildApp()
    expect(await treeRoutes(app.root)).toEqual(['/', '/about'])
  })

  // (each config resolution's generation
  // printed the generator's warnings again: three lines in one build)
  test('builds given the same plugin objects inline print a generator warning once each', async () => {
    const { createBuilder } = await vite()
    const app = await routerApp(major)
    await writeFile(
      path.join(app.root, 'routes/about.tsx'),
      `${head}const id = '/about'\nexport const Route = createFileRoute(id)({})\n`,
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onTestFinished(() => warn.mockRestore())
    const printed = () =>
      warn.mock.calls.filter((args) =>
        String(args[0]).includes('not a string literal'),
      ).length
    const config = app.buildConfig({
      configFile: false,
      plugins: app.plugins(),
    })
    await (await createBuilder(config)).buildApp()
    expect(printed()).toBe(1)
    await (await createBuilder(config)).buildApp()
    expect(printed()).toBe(2)
  })

  test('a second build given the same plugin objects inline generates the routes added since the first', async () => {
    const { createBuilder } = await vite()
    const app = await routerApp(major)
    // a program's own builds: no config file, one plugin array for both
    const config = app.buildConfig({
      configFile: false,
      plugins: app.plugins(),
    })
    await (await createBuilder(config)).buildApp()
    await writeFile(path.join(app.root, 'routes/about.tsx'), route('/about'))
    await (await createBuilder(config)).buildApp()
    expect(await treeRoutes(app.root)).toEqual(['/', '/about'])
  })
})
