/**
 * Real Start apps for the integration tests: a temporary app directory, built
 * or served the way `vite build`, `vite dev`, `rsbuild build` and
 * `rsbuild dev` do, with `tanstackStart()` of the built
 * `@tanstack/react-start` package (its `plugin/vite` and `plugin/rsbuild`
 * entries, which run this package's built `dist`). The `test:integration`
 * target builds both packages first.
 *
 * The app links the workspace's `@tanstack/react-start` and the
 * `@tanstack/react-router`, `react` and `react-dom` it uses, as an installed
 * app would.
 */
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
import { createBuilder, createServer } from 'vite'
import { onTestFinished } from 'vitest'
import type { ViteDevServer } from 'vite'

/** The options of `tanstackStart()`. */
export type StartOptions = Record<string, unknown>

const reactStartDir = fileURLToPath(
  new URL('../../../react-start', import.meta.url),
)

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
  read: (file: string) => Promise<string>
  write: (files: Record<string, string>) => Promise<void>
}

/**
 * Creates an app directory under the system's temporary directory, its name
 * starting with `prefix`, and makes it the working directory, as running
 * `vite` or `rsbuild` in the app's directory does (the generator and
 * Rsbuild's virtual modules write under it). Both are undone when the test
 * finishes.
 */
export async function createStartApp(
  files: Record<string, string>,
  prefix = 'start-app-',
): Promise<StartApp> {
  const root = realpathSync(await mkdtemp(path.join(os.tmpdir(), prefix)))
  const cwd = process.cwd()
  process.chdir(root)
  onTestFinished(async () => {
    process.chdir(cwd)
    await rm(root, { recursive: true, force: true })
  })
  const links: Record<string, string> = {
    '@tanstack/react-start': reactStartDir,
  }
  for (const name of ['@tanstack/react-router', 'react', 'react-dom']) {
    links[name] = realpathSync(path.join(reactStartDir, 'node_modules', name))
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
    read: (file) => readFile(path.join(root, file), 'utf8'),
    write,
  }
}

async function startPlugin(bundler: 'vite' | 'rsbuild', options: StartOptions) {
  const entry = path.join(reactStartDir, 'dist/esm/plugin', `${bundler}.js`)
  const { tanstackStart } = await import(pathToFileURL(entry).href)
  return tanstackStart(options)
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
}

/** Builds the app as `vite build` or `rsbuild build` does. */
export async function buildStartApp(
  app: StartApp,
  bundler: 'vite' | 'rsbuild',
  options: StartOptions = {},
): Promise<StartBuild> {
  const plugin = await startPlugin(bundler, options)
  if (bundler === 'vite') {
    const builder = await createBuilder({
      root: app.root,
      configFile: false,
      logLevel: 'error',
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
    plugins: [await startPlugin('vite', options)],
  })
  onTestFinished(() => server.close())
  return server
}

/**
 * Starts the app's Rsbuild dev server, as `rsbuild dev` does; closed when the
 * test finishes. Returns its URL.
 */
export async function startRsbuildDevServer(
  app: StartApp,
  options: StartOptions = {},
): Promise<URL> {
  const rsbuild = await createRsbuild({
    cwd: app.root,
    loadEnv: false,
    rsbuildConfig: {
      logLevel: 'error',
      server: { printUrls: false },
      plugins: [await startPlugin('rsbuild', options)],
    },
  })
  const { port, server } = await rsbuild.startDevServer()
  onTestFinished(() => server.close())
  return new URL(`http://localhost:${port}/`)
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
