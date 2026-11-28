/**
 * Vite dev: a generator run that replaced files (the route tree, a route
 * file it kept up) is served from the disk on the next request once it is
 * published, whether or not Vite's watcher reports the write (SPEC J1.10):
 * `tanstackRouterGenerator()` alone and `tanstackRouter()`, a tree behind a
 * linked directory (its module is the real path), and an older tree event
 * another plugin holds in its `hotUpdate`. The dev servers' watchers report
 * nothing of the app on their own: each test reports the route file's event
 * on Vite's watcher, and the tree's never comes (a lost event, D5). A plugin
 * object that served a dev server builds afterwards.
 * Source: design-routeset-v5.1.md §6 step 4 (the reviews' `viteGeneratorOnly`,
 * `symlink-tree`, `confirm` and `pluginReuseAcrossServers` drivers).
 */
import { symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { expect, onTestFinished, test } from 'vitest'
import { build, createServer } from 'vite'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { tanstackRouter, tanstackRouterGenerator } from '../src/vite'
import { head, rootRoute } from './build-harness'
import type { Plugin, PluginOption, ViteDevServer } from 'vite'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

const route = (id: string) =>
  `${head}export const Route = createFileRoute('${id}')({})\n`

/** An app with a root and an index route (and `files`), removed when the test ends. */
async function routeApp(files: Record<string, string> = {}) {
  const { root } = await createApp({
    dir: harnessDir,
    registerCleanup: onTestFinished,
    files: {
      'src/routes/__root.tsx': rootRoute,
      'src/routes/index.tsx': route('/'),
      ...files,
    },
  })
  return root
}

/** A Vite dev server on `root` whose watcher reports nothing of the app on its own. */
async function devServer(
  root: string,
  plugins: Array<PluginOption>,
): Promise<ViteDevServer> {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: {
      middlewareMode: true,
      ws: false,
      watch: { ignored: [path.join(root, '**')] },
    },
    optimizeDeps: { noDiscovery: true },
    plugins,
  })
  onTestFinished(() => server.close())
  return server
}

/** Creates a route file and reports it on Vite's watcher. */
async function addRoute(server: ViteDevServer, file: string, id: string) {
  await writeFile(file, route(id))
  server.watcher.emit('add', file)
}

/** Waits until the client environment serves `url` importing `text`. */
function serves(server: ViteDevServer, url: string, text: string) {
  let last = ''
  return waitForOutcome({
    timeout: 10_000,
    applied: async () => {
      last =
        (await server.environments.client.transformRequest(url))?.code ?? ''
      return last.includes(text)
    },
    describe: () => `${url} does not import ${text}:\n${last}`,
  })
}

const options = (root: string, tree = 'src/routeTree.gen.ts') => ({
  target: 'react' as const,
  routesDirectory: path.join(root, 'src/routes'),
  generatedRouteTree: path.join(root, tree),
})

test("tanstackRouterGenerator() alone: a route added is served though Vite's watcher does not report the tree's write", async () => {
  const root = await routeApp()
  const url = '/src/routeTree.gen.ts'
  const server = await devServer(root, [tanstackRouterGenerator(options(root))])
  await server.environments.client.transformRequest(url)
  await addRoute(server, path.join(root, 'src/routes/new.tsx'), '/new')
  await serves(server, url, 'routes/new')
})

test('tanstackRouter() with the route tree behind a linked directory: a route added is served', async () => {
  const root = await routeApp({ 'src/actual/.keep': '' })
  await symlink('actual', path.join(root, 'src/alias'))
  const url = '/src/alias/tree.gen.ts'
  const server = await devServer(root, [
    tanstackRouter({
      ...options(root, 'src/alias/tree.gen.ts'),
      autoCodeSplitting: true,
    }),
  ])
  await server.environments.client.transformRequest(url)
  await addRoute(server, path.join(root, 'src/routes/new.tsx'), '/new')
  await serves(server, url, 'routes/new')
})

test('an older tree event another plugin holds in its hotUpdate: the newer tree published meanwhile is served', async () => {
  const root = await routeApp()
  const url = '/src/routeTree.gen.ts'
  const tree = path.join(root, 'src/routeTree.gen.ts').replace(/\\/g, '/')
  let gate = false
  let entered = () => {}
  let release = () => {}
  const holding = new Promise<void>((resolve) => {
    entered = resolve
  })
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  onTestFinished(release)
  const holder: Plugin = {
    name: 'test:hold-tree-update',
    hotUpdate: {
      order: 'pre',
      async handler(ctx) {
        if (gate && ctx.file === tree && this.environment.name === 'client') {
          gate = false
          // (the tree as it is now, served again before the hold)
          await this.environment.transformRequest(url)
          entered()
          await held
          return []
        }
        return undefined
      },
    },
  }
  const server = await devServer(root, [
    holder,
    tanstackRouter({ ...options(root), autoCodeSplitting: true }),
  ])
  await server.environments.client.transformRequest(url)
  gate = true
  server.watcher.emit('change', tree)
  await holding
  await addRoute(server, path.join(root, 'src/routes/new.tsx'), '/new')
  await serves(server, url, 'routes/new')
  release()
})

test('one plugin object: a dev server, closed, then a build with it', async () => {
  const root = await routeApp({
    'index.html': '<script type="module" src="/src/main.ts"></script>\n',
    'src/main.ts': `import { routeTree } from './routeTree.gen'\nconsole.log(routeTree)\n`,
  })
  const plugin = tanstackRouterGenerator(options(root))
  const server = await devServer(root, [plugin])
  await server.environments.client.transformRequest('/src/routeTree.gen.ts')
  await addRoute(server, path.join(root, 'src/routes/new.tsx'), '/new')
  await serves(server, '/src/routeTree.gen.ts', 'routes/new')
  await server.close()
  await writeFile(path.join(root, 'src/routes/other.tsx'), route('/other'))
  const output = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [plugin],
    build: { write: false },
  })
  expect(JSON.stringify(output)).toContain('/other')
})

// The plugin object outlives the dev server it served (a program that keeps
// its config, Vite 8 keeping finished servers' plugins): the closed server
// must not stay reachable through it.
// Source: review of the route-set work (Astra 4, Gemini M1: the callback
// that watches routes outside the root kept the server).
test('a closed dev server is not kept alive by the plugin object', async () => {
  const root = await routeApp()
  const plugin = tanstackRouterGenerator(options(root))
  // (a server of its own: the helper's cleanup would hold it)
  const closed = await (async () => {
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true },
      plugins: [plugin],
    })
    await server.close()
    return new WeakRef(server)
  })()
  // (within a time bound, not a count of collections: a closed watcher's
  // handles are released by callbacks of later event loop turns, and
  // Windows' file watching handles close asynchronously)
  setFlagsFromString('--expose-gc')
  const gc = runInNewContext('gc') as () => void
  const deadline = Date.now() + 10_000
  while (closed.deref() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    gc()
  }
  expect(closed.deref()).toBeUndefined()
  expect(plugin).toBeDefined()
})
