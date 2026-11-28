/**
 * Real Start apps for the integration tests: a temporary app directory, built
 * or served the way `vite build`, `vite dev` and `rsbuild build` do, with
 * `tanstackStart()` of the built `@tanstack/react-start` package (its
 * `plugin/vite` and `plugin/rsbuild` entries, which run this package's built
 * `dist`). The `test:integration` target builds both packages first. An app
 * can use `@tanstack/vue-start` instead (`createStartApp`'s `framework`).
 *
 * The app links the workspace's `@tanstack/react-start` and the
 * `@tanstack/react-router`, `react` and `react-dom` it uses, as an installed
 * app would. A package that only uses Start's compile-time APIs links fewer
 * (`dependencies` of `createStartApp`).
 */
import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRsbuild } from '@rsbuild/core'
import { createBuilder, createLogger, createServer } from 'vite'
import { onTestFinished } from 'vitest'
import type { ViteDevServer } from 'vite'

/** The options of `tanstackStart()`. */
export type StartOptions = Record<string, unknown>

/** The frameworks an app can use Start with in these tests. */
export type StartFramework = 'react' | 'vue'

function startPackageDir(framework: StartFramework) {
  return fileURLToPath(new URL(`../../../${framework}-start`, import.meta.url))
}

const routerEntry = `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`

const rootRoute = `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`

/** The files of an app with only a root route; `files` adds or replaces. */
export function appFiles(files: Record<string, string> = {}) {
  return {
    'src/router.ts': routerEntry,
    'src/routes/__root.tsx': rootRoute,
    ...files,
  }
}

export interface StartApp {
  root: string
  framework: StartFramework
  read: (file: string) => Promise<string>
  write: (files: Record<string, string>) => Promise<void>
}

/**
 * Creates an app directory under the system's temporary directory, its name
 * starting with `prefix`, and makes it the working directory, as running
 * `vite` or `rsbuild` in the app's directory does (the generator and
 * Rsbuild's virtual modules write under it). Both are undone when the test
 * finishes.
 *
 * `dependencies` are the packages the app depends on besides the Start
 * package of its `framework`: only these resolve from the app's directory.
 */
export async function createStartApp(
  files: Record<string, string>,
  {
    prefix = 'start-app-',
    dependencies = ['@tanstack/react-router', 'react', 'react-dom'],
    framework = 'react',
  }: {
    prefix?: string
    dependencies?: Array<string>
    framework?: StartFramework
  } = {},
): Promise<StartApp> {
  const root = realpathSync(await mkdtemp(path.join(os.tmpdir(), prefix)))
  const cwd = process.cwd()
  process.chdir(root)
  onTestFinished(async () => {
    process.chdir(cwd)
    await rm(root, { recursive: true, force: true })
  })
  const startDir = startPackageDir(framework)
  const links: Record<string, string> = {
    [`@tanstack/${framework}-start`]: startDir,
  }
  for (const name of dependencies) {
    links[name] = realpathSync(path.join(startDir, 'node_modules', name))
  }
  for (const [name, target] of Object.entries(links)) {
    const link = path.join(root, 'node_modules', name)
    await mkdir(path.dirname(link), { recursive: true })
    // (a junction on Windows, which needs no privilege; a symlink elsewhere)
    await symlink(target, link, 'junction')
  }
  const write = async (next: Record<string, string>) => {
    for (const [file, code] of Object.entries(next)) {
      const target = path.join(root, file)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, code)
    }
  }
  await write({
    'package.json': JSON.stringify({ name: 'app', type: 'module' }),
    ...files,
  })
  return {
    root,
    framework,
    read: (file) => readFile(path.join(root, file), 'utf8'),
    write,
  }
}

async function startPlugin(
  app: StartApp,
  bundler: 'vite' | 'rsbuild',
  options: StartOptions,
) {
  const entry = path.join(
    startPackageDir(app.framework),
    'dist/esm/plugin',
    `${bundler}.js`,
  )
  const { tanstackStart } = await import(pathToFileURL(entry).href)
  return tanstackStart(options)
}

/** A Vite logger that keeps the warnings instead of printing them. */
function warningCollector() {
  const warnings: Array<string> = []
  const customLogger = createLogger('error')
  customLogger.warn = (message) => warnings.push(message)
  customLogger.warnOnce = customLogger.warn
  return { customLogger, warnings }
}

/** The JavaScript a build emitted under `dir` (of the app), concatenated. */
async function emittedCode(dir: string) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const code: Array<string> = []
  for (const entry of entries) {
    if (entry.isFile() && /\.m?js$/.test(entry.name)) {
      code.push(await readFile(path.join(entry.parentPath, entry.name), 'utf8'))
    }
  }
  return code.join('\n')
}

export interface StartBuild {
  /** The client build's JavaScript. */
  client: string
  /** The server build's JavaScript. */
  server: string
  /** The warnings a Vite build logged (not collected for Rsbuild). */
  warnings: Array<string>
}

/** Builds the app as `vite build` or `rsbuild build` does. */
export async function buildStartApp(
  app: StartApp,
  bundler: 'vite' | 'rsbuild',
  options: StartOptions = {},
): Promise<StartBuild> {
  const plugin = await startPlugin(app, bundler, options)
  const { customLogger, warnings } = warningCollector()
  if (bundler === 'vite') {
    const builder = await createBuilder({
      root: app.root,
      configFile: false,
      customLogger,
      plugins: [plugin],
    })
    await builder.buildApp()
  } else {
    const rsbuild = await createRsbuild({
      cwd: app.root,
      loadEnv: false,
      rsbuildConfig: { logLevel: 'error', plugins: [plugin] },
    })
    await rsbuild.build()
  }
  return {
    client: await emittedCode(path.join(app.root, 'dist/client')),
    server: await emittedCode(path.join(app.root, 'dist/server')),
    warnings,
  }
}

/** Starts the app's Vite dev server (middleware mode); closed when the test finishes. */
export async function startViteDevServer(
  app: StartApp,
  options: StartOptions = {},
): Promise<ViteDevServer> {
  const server = await createServer({
    root: app.root,
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true },
    plugins: [await startPlugin(app, 'vite', options)],
  })
  onTestFinished(() => server.close())
  return server
}

export interface ViteTestServer {
  server: ViteDevServer
  /** The warnings Vite logged while the server started. */
  warnings: Array<string>
}

/**
 * Starts the Vite server a test runner creates to run a project's tests: the
 * `serve` command and the `test` mode, as Vitest resolves its config, without
 * HMR. These tests run in a Vitest worker themselves (`process.env.VITEST`),
 * so Start's plugin sees what it sees in a user's Vitest run. Closed when
 * the test finishes.
 *
 * `browser`: as for tests that run in a browser, the server pre-bundles the
 * dependencies of the client.
 */
export async function startViteTestServer(
  app: StartApp,
  { browser = false }: { browser?: boolean } = {},
): Promise<ViteTestServer> {
  const { customLogger, warnings } = warningCollector()
  const server = await createServer({
    root: app.root,
    configFile: false,
    mode: 'test',
    customLogger,
    // (Vite starts pre-bundling when the server takes requests, which a
    // server in middleware mode does at once)
    server: { middlewareMode: browser, hmr: false },
    // (the pre-bundle is written when it is ready, not when a page has loaded)
    optimizeDeps: { holdUntilCrawlEnd: false },
    plugins: [await startPlugin(app, 'vite', {})],
  })
  onTestFinished(async () => {
    // Closing the server does not wait for a pre-bundle in progress, which
    // would then be written into the removed app directory.
    const optimizer = server.environments.client.depsOptimizer
    if (browser && optimizer) {
      await optimizer.scanProcessing
      await Promise.all(
        optimizer.metadata.depInfoList.map((dep) => dep.processing),
      )
    }
    await server.close()
  })
  return { server, warnings }
}

export interface VitestRun {
  exitCode: number
  /** What Vitest printed. */
  output: string
}

/**
 * Runs the app's tests once with the Vitest CLI in a process of its own, as
 * `vitest run` in the app's directory does. Unlike `startViteTestServer`
 * this is Vitest itself, with its module cache on disk; a second run starts
 * a new process that finds the cache of the first.
 *
 * The app needs `vitest` among its `dependencies` and a Vitest config.
 */
export function runVitest(app: StartApp): Promise<VitestRun> {
  // (these tests run in a Vitest worker, whose own settings are not passed on)
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('VITEST')),
  )
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [path.join(app.root, 'node_modules/vitest/vitest.mjs'), 'run'],
      { cwd: app.root, env },
      (error, stdout, stderr) => {
        resolve({
          exitCode:
            typeof error?.code === 'number' ? error.code : error ? 1 : 0,
          output: stdout + stderr,
        })
      },
    )
  })
}

/**
 * Waits until the dev server's file watcher reports changes in `dir` (of the
 * app). The generator prints the first route tree before the watcher exists
 * (`configResolved`), and the watcher's initial scan takes a file written
 * before it ends for one that was already there (no `add`). So the test
 * writes a file the generator ignores (`-` prefix) until the watcher
 * reports it, and only then makes the edit it checks.
 */
export async function watcherReady(
  app: StartApp,
  server: ViteDevServer,
  dir: string,
) {
  const probe = path.join(app.root, dir, '-watch-probe.ts')
  let seen = false
  const onEvent = (_event: string, file: string) => {
    if (path.resolve(file) === probe) {
      seen = true
    }
  }
  server.watcher.on('all', onEvent)
  try {
    let writes = 0
    await until(async () => {
      if (!seen) {
        await writeFile(probe, `export {}\n// ${writes++}\n`)
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      return seen
    }, `the file watcher of ${dir}`)
  } finally {
    server.watcher.off('all', onEvent)
  }
}

/** Waits for `check`, bounded. */
export async function until(check: () => Promise<boolean>, what: string) {
  const deadline = Date.now() + 20_000
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
