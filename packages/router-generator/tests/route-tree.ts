/**
 * A public generator consumer: Vite resolves the app's explicit public
 * runtime/renderer imports. Fixture source identities are compared with their
 * real exports; no dependency layout or runner module inventory is inspected.
 * A public Vite transform hook observes requests for fixture-owned files only.
 */
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  createLogger,
  createServer,
  createServerModuleRunner,
  parseSync,
} from 'vite'
import { linkDirectory } from '@tanstack/compiler-test-utils/app-directory'
import { runAsDevCommand } from '@tanstack/compiler-test-utils/dev-command'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'
import { onFileFinished } from '@tanstack/compiler-test-utils/test-scope'
import { forgetApp, inputsOf, recordInputs } from './consumer-inputs'
import type { PluginOption, ViteDevServer } from 'vite'
import type { createClientConsumer as CreateClientConsumer } from './consumer-client'

const nodeModules = path.resolve(import.meta.dirname, '../node_modules')

/** Imports chosen from fixture INPUTS, never from generated imports or dist paths. */
function frameworkOf(files: Record<string, string>) {
  const sources = Object.values(files).join('\n')
  if (sources.includes('@tanstack/solid-router')) {
    return 'solid'
  }
  if (
    sources.includes('@tanstack/vue-router') ||
    Object.keys(files).some((file) => file.endsWith('.vue'))
  ) {
    return 'vue'
  }
  return 'react'
}

/** A normal app entry with explicit public package imports, in the same runner. */
function consumerSource(framework: string) {
  const render =
    framework === 'react'
      ? `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export const render = (Component, props = {}) => renderToString(createElement(Component, props))`
      : framework === 'vue'
        ? `import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
export const render = (Component, props = {}) => renderToString(createSSRApp({ render: () => h(Component, props) }))`
        : `import { renderToStringAsync, createComponent } from 'solid-js/web'
export const render = (Component, props = {}) => renderToStringAsync(() => createComponent(Component, props))`
  return `export * as runtime from '@tanstack/${framework}-router'\n${render}`
}

/** What one load records of the app it loads (the consumer's view). */
interface Load {
  posixRoot: string
  inputOf: (id: string) => string | undefined
  requested: Set<string>
  printedRequests: Map<string, Set<string>>
  imports: Array<{ file: string; specifier: string; importer: string }>
}

/**
 * The Vite server of a framework shared by the loads of one test file (one
 * per framework: its plugins differ). Its transforms of the router packages
 * and the framework (Solid's go through Babel) are kept; each load forgets
 * its app's modules first and evaluates them in a runner of its own, so no
 * load sees what an earlier one evaluated.
 */
interface Host {
  server: ViteDevServer
  /** The loads running now: the observer plugin records into each one whose app holds the file. */
  loads: Set<Load>
}

const hosts = new Map<string, Promise<Host>>()

/** The fixture-owned requests and imports a load observes (public Vite hooks). */
function observerPlugin(loads: Set<Load>): PluginOption {
  const loadsOf = (file: string) =>
    [...loads].filter((load) => file.startsWith(load.posixRoot + '/'))
  return {
    name: 'generator-consumer:fixture-requests',
    enforce: 'pre',
    async resolveId(specifier, importer) {
      if (
        !importer ||
        (!specifier.startsWith('.') && !path.isAbsolute(specifier))
      ) {
        return
      }
      const resolved = await this.resolve(specifier, importer, {
        skipSelf: true,
      })
      if (resolved) {
        const from = importer.split('?')[0]!
        for (const load of loadsOf(from)) {
          const file = load.inputOf(resolved.id)
          if (file && load.printedRequests.get(from)?.has(specifier)) {
            load.imports.push({ file, specifier, importer: from })
          }
        }
      }
      return resolved
    },
    transform(code, id) {
      const file = id.split('?')[0]!
      for (const load of loadsOf(file)) {
        const input = load.inputOf(id)
        if (input) {
          load.requested.add(input)
        } else if (
          !file.includes('/node_modules/') &&
          /\.[cm]?[jt]sx?$/.test(file)
        ) {
          // Distinguish source imports from Vite's subsequent canonical-id
          // requests. Oxc decodes literals; Vite still resolves every edge.
          const specifiers = new Set<string>()
          const visit = (node: any): void => {
            if (!node || typeof node !== 'object') {
              return
            }
            if (
              [
                'ImportDeclaration',
                'ExportNamedDeclaration',
                'ExportAllDeclaration',
                'ImportExpression',
              ].includes(node.type) &&
              typeof node.source?.value === 'string'
            ) {
              specifiers.add(node.source.value)
            }
            for (const child of Object.values(node)) {
              if (Array.isArray(child)) {
                child.forEach(visit)
              } else if (child && typeof child === 'object') {
                visit(child)
              }
            }
          }
          visit(parseSync(file, code).program)
          load.printedRequests.set(file, specifiers)
        }
      }
    },
  }
}

/** The framework's shared host of the test file running now. */
function hostOf(framework: string): Promise<Host> {
  let host = hosts.get(framework)
  if (!host) {
    host = createHost(framework)
    hosts.set(framework, host)
    onFileFinished(async () => {
      hosts.delete(framework)
      const { server } = await host!
      await server.close()
    })
  }
  return host
}

async function createHost(framework: string): Promise<Host> {
  const loads = new Set<Load>()
  const plugins: Array<PluginOption> = [observerPlugin(loads)]
  if (framework === 'vue') {
    const { default: vue } = await import('@vitejs/plugin-vue')
    plugins.push(vue())
  }
  if (framework === 'solid') {
    const { default: solid } = await import('vite-plugin-solid')
    plugins.push(solid({ ssr: true }))
  }
  // (Vite resolves the externals of SSR from its root: the packages every
  // app links)
  const root = await mkdtemp(path.join(runDirectory(), 'tsr-consumer-'))
  await linkDirectory(nodeModules, path.join(root, 'node_modules'))
  const server = await runAsDevCommand(async () =>
    createServer({
      root,
      configFile: false,
      // (its own: Vite's default, the `node_modules/.vite` of a root without
      // a package.json, is this package's)
      cacheDir: path.join(root, '.vite'),
      envDir: false,
      appType: 'custom',
      // (no row reads what Vite logs while it loads an app)
      customLogger: createLogger('silent'),
      clearScreen: false,
      plugins,
      server: { middlewareMode: true, hmr: false, watch: null, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      ssr: framework === 'solid' ? {} : { external: true },
    }),
  )
  const close = server.close.bind(server)
  server.close = async () => {
    await close()
    await rm(root, { recursive: true, force: true })
  }
  return { server, loads }
}

async function withModule<T>(
  file: string,
  use: (loaded: {
    exports: Record<string, any>
    runtime: Record<string, any>
    framework: string
    sources: Map<string, Record<string, any>>
    loadedFiles: () => Array<string>
    import: (file: string) => Promise<Record<string, any>>
    render: (Component: any, props?: object) => Promise<string>
    imports: Array<{ file: string; specifier: string; importer: string }>
  }) => Promise<T> | T,
): Promise<T> {
  const realFile = await realpath(file)
  const { root, files, target: framework } = inputsOf(realFile)
  // In-repository fixtures already resolve the package's dependencies from
  // their parent. Only standalone temporary apps need their own link.
  const fromPackage = path.relative(path.dirname(nodeModules), root)
  if (fromPackage.startsWith('..') || path.isAbsolute(fromPackage)) {
    await linkDirectory(nodeModules, path.join(root, 'node_modules')).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') {
          throw error
        }
      },
    )
  }
  // Vite ids have forward slashes whatever the platform; the recorded
  // inputs are native paths (Windows: backslashes)
  const posix = (file: string) => file.replaceAll(path.sep, '/')
  const inputByPosix = new Map(
    Object.keys(files).map((file) => [posix(file), file] as const),
  )
  const load: Load = {
    posixRoot: posix(root),
    inputOf: (id) => inputByPosix.get(id.split('?')[0]!),
    requested: new Set(),
    printedRequests: new Map(),
    imports: [],
  }
  const host = await hostOf(framework)
  if ([...host.loads].some(({ posixRoot }) => posixRoot === load.posixRoot)) {
    throw new Error(`${root} is being loaded already`)
  }
  // (the process takes up the dev servers' environment again, as at their
  // start)
  runAsDevCommand()
  const environment = host.server.environments.ssr
  forgetApp(environment, root)
  const entry = path.join(path.dirname(file), `.consumer-${randomUUID()}.ts`)
  await writeFile(entry, consumerSource(framework))
  host.loads.add(load)
  const runner = createServerModuleRunner(environment, { hmr: false })
  try {
    const consumer = await runner.import(entry)
    const exports = await runner.import(realFile)
    const sources = new Map<string, Record<string, any>>()
    // Import only fixture files the app already requested. This cannot eagerly
    // pull in a lazy source, and a generated facade can never own its identity.
    for (const source of [...load.requested]) {
      sources.set(source, await runner.import(source))
    }
    return await use({
      exports,
      runtime: consumer.runtime,
      framework,
      sources,
      imports: load.imports,
      loadedFiles: () => [...load.requested].sort(),
      import: (source) => runner.import(source),
      render: consumer.render,
    })
  } finally {
    host.loads.delete(load)
    await runner.close()
    await rm(entry, { force: true })
  }
}

export async function evaluateModule(code: string, fileName = 'route.tsx') {
  const root = await mkdtemp(path.join(runDirectory(), 'tsr-module-'))
  try {
    const file = path.join(root, fileName)
    await writeFile(file, code)
    recordInputs(root, { [fileName]: code }, frameworkOf({ [fileName]: code }))
    return await withModule(file, ({ exports, runtime }) => ({
      exports,
      router: runtime,
    }))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

export interface RouterRoute {
  id: string
  fullPath: string
  path?: string
  parentRoute?: RouterRoute
  options: Record<string, any>
}

export interface LoadedRouteTree {
  router: {
    routeTree: RouterRoute
    routesById: Record<string, RouterRoute>
    matchRoutes: (pathname: string) => Array<{ routeId: string }>
    [key: string]: any
  }
  routerPackage: Record<string, any>
  framework: string
  fileOf: (routeId: string) => string | null
  /** Each route's file (`fileOf`), by route id. */
  routeFiles: () => Record<string, string | null>
  /** Fixture-owned modules requested by the real host, relative to the tree. */
  loadedFiles: () => Array<string>
  import: (file: string) => Promise<Record<string, any>>
  render: (component: unknown) => Promise<string>
  renderClientAt: (
    url: string,
    expectedParagraphs: Array<string>,
  ) => Promise<string>
  renderAt: (url: string) => Promise<string>
  imports: Array<{ file: string; specifier: string; importer: string }>
}

export function withRouteTree<T>(
  treeFile: string,
  use: (tree: LoadedRouteTree) => Promise<T> | T,
): Promise<T> {
  return withModule(
    treeFile,
    async ({
      exports,
      runtime,
      framework,
      sources,
      loadedFiles,
      import: importFile,
      render,
      imports,
    }) => {
      const { routeTree } = exports
      const router: LoadedRouteTree['router'] = runtime.createRouter({
        routeTree,
        history: runtime.createMemoryHistory(),
      })
      const treeDir = path.dirname(await realpath(treeFile))
      const relative = (file: string) =>
        path.relative(treeDir, file).replaceAll(path.sep, '/')
      const fileOf = (id: string) => {
        const route = router.routesById[id]
        if (!route) {
          throw new Error(`The router has no route ${id}`)
        }
        const owners = [...sources].filter(
          ([, module]) => module.Route === route,
        )
        if (owners.length > 1) {
          throw new Error(
            `Ambiguous fixture Route identity: ${owners.map(([file]) => relative(file)).join(', ')}`,
          )
        }
        return owners.length ? relative(owners[0]![0]) : null
      }
      let client: Awaited<ReturnType<typeof CreateClientConsumer>> | undefined
      try {
        return await use({
          router,
          routerPackage: runtime,
          framework,
          fileOf,
          routeFiles: () =>
            Object.fromEntries(
              Object.keys(router.routesById).map((id) => [id, fileOf(id)]),
            ),
          imports,
          loadedFiles: () => loadedFiles().map(relative).sort(),
          import: importFile,
          render: async (component) => {
            // Ask the router to load its option, rather than reaching into the
            // lazy wrapper. loadRouteChunk's componentType is a public argument.
            for (const route of Object.values(router.routesById)) {
              for (const option of [
                'component',
                'errorComponent',
                'pendingComponent',
                'notFoundComponent',
              ]) {
                if (route.options[option] === component) {
                  await router.loadRouteChunk(
                    route,
                    option === 'errorComponent' ||
                      option === 'notFoundComponent'
                      ? option
                      : undefined,
                  )
                }
              }
            }
            return render(component)
          },
          renderClientAt: async (url, expectedParagraphs) => {
            const { createClientConsumer } = await import('./consumer-client')
            client ??= await createClientConsumer(treeFile, framework)
            return client.renderAt(url, expectedParagraphs)
          },
          renderAt: async (url) => {
            const pageRouter = runtime.createRouter({
              routeTree,
              history: runtime.createMemoryHistory({ initialEntries: [url] }),
            })
            await pageRouter.load()
            return render(runtime.RouterProvider, { router: pageRouter })
          },
        })
      } finally {
        await client?.close()
      }
    },
  )
}

/**
 * The routes of the router built from the generated route tree at
 * `treeFile`: route id (`__root__` for the root route) to the file whose
 * `Route` the route is, relative to the tree (null for a route the tree
 * creates itself, such as a route with only a lazy route file).
 */
export function routesOf(
  treeFile: string,
): Promise<Record<string, string | null>> {
  return withRouteTree(treeFile, ({ routeFiles }) => routeFiles())
}

/**
 * The full path (the URL path it matches, with its parents') of each route
 * of the router built from the generated route tree at `treeFile`, by route
 * id.
 */
export function urlsOf(treeFile: string): Promise<Record<string, string>> {
  return withRouteTree(treeFile, ({ router }) =>
    Object.fromEntries(
      Object.values(router.routesById).map((route) => [
        route.id,
        route.fullPath,
      ]),
    ),
  )
}

/**
 * The ids of the routes the router built from the generated route tree at
 * `treeFile` matches for `pathname`, the root route first.
 */
export function matchesOf(
  treeFile: string,
  pathname: string,
): Promise<Array<string>> {
  return withRouteTree(treeFile, ({ router }) =>
    router.matchRoutes(pathname).map((match) => match.routeId),
  )
}

/** A route of the router, as an app observes it. */
export interface ObservedRoute {
  /** The URL path it matches, with its parents'. */
  fullPath: string
  /** Its parent route's id; null for the root route. */
  parent: string | null
  /** The file whose `Route` it is (relative to the tree); null if none. */
  file: string | null
  /**
   * The app files that load only once the router loads the route
   * (`loadRouteChunk`): its lazy route file and lazy components.
   */
  lazy: Array<string>
}

/**
 * The routes of the router built from the generated route tree at
 * `treeFile`, by route id: full path, parent, route file, and the app files
 * that load lazily with the route (routes are loaded in route id order; a
 * route's lazy files are those no route loaded before). Only fixture-owned files participate; generated support filenames and
 * placement are free.
 */
export function observeRouteTree(
  treeFile: string,
): Promise<Record<string, ObservedRoute>> {
  return withRouteTree(treeFile, async ({ router, fileOf, loadedFiles }) => {
    const observed: Record<string, ObservedRoute> = {}
    for (const id of Object.keys(router.routesById).sort()) {
      const route = router.routesById[id]!
      const before = new Set(loadedFiles())
      await router.loadRouteChunk(route)
      observed[id] = {
        fullPath: route.fullPath,
        parent: route.parentRoute?.id ?? null,
        file: fileOf(id),
        lazy: loadedFiles().filter((file) => !before.has(file)),
      }
    }
    return observed
  })
}
