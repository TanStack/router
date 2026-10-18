/**
 * Shared test helper: a generated route tree as the app gets it. The tree and
 * the modules it imports are loaded by a real Vite server (the Vue plugin
 * compiles single-file components), and the app's own router package
 * (`@tanstack/react-router`, `@tanstack/vue-router`) builds a real router
 * from it with `createRouter`. Route ids, full paths, parents, matching and
 * lazily loaded options are the router's; nothing here derives them.
 *
 * This package has no Solid router, Solid compiler or React DOM renderer:
 * Solid apps do not load here, and only Vue pages render.
 */
import { existsSync } from 'node:fs'
import {
  mkdtemp,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, createServerModuleRunner } from 'vite'
import type { ModuleRunner } from 'vite/module-runner'

/** This package's dependencies, for apps to import their packages from. */
const nodeModules = path.resolve(import.meta.dirname, '../node_modules')

/** The router packages an app may use, and the frameworks they render with. */
const routerPackages = /^@tanstack\/(react|solid|vue)-router$/

/**
 * The root of the app `file` belongs to: the nearest directory above it with
 * a `node_modules`, or, for an app in a temporary directory, the temporary
 * directory, which gets this package's `node_modules`.
 */
async function appRootOf(file: string) {
  const temporary = await realpath(tmpdir())
  let dir = path.dirname(await realpath(file))
  for (;;) {
    if (existsSync(path.join(dir, 'node_modules'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === temporary) {
      await symlink(
        nodeModules,
        path.join(dir, 'node_modules'),
        'junction',
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') {
          throw error
        }
      })
      return dir
    }
    if (parent === dir) {
      throw new Error(`${file} is in no app (no node_modules above it)`)
    }
    dir = parent
  }
}

/**
 * The Vite plugins of the app at `root`: the Vue plugin when the app has
 * single-file components (loaded only then: it is large).
 */
async function pluginsOf(root: string) {
  const hasVueFiles = async (dir: string): Promise<boolean> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.vue')) {
        return true
      }
      if (
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        !entry.name.startsWith('.') &&
        (await hasVueFiles(path.join(dir, entry.name)))
      ) {
        return true
      }
    }
    return false
  }
  if (!(await hasVueFiles(root))) {
    return []
  }
  const { default: vue } = await import('@vitejs/plugin-vue')
  return [vue()]
}

/** A module of the app, loaded by a Vite server of the app. */
interface LoadedModule {
  /** The module's exports. */
  exports: Record<string, any>
  /** The module runner that loaded it, with the modules it evaluated. */
  runner: ModuleRunner
  /** The router package the app's modules import, if any, and its name. */
  router?: { name: string; exports: Record<string, any> }
}

/**
 * Loads `file` (absolute path) like its app's dev server does for server
 * rendering: a fresh Vite server (no transform or module caches shared with
 * other loads), with the Vue plugin for an app with single-file components;
 * packages are loaded by Node. JSX in `.tsx`/`.jsx` files compiles with
 * Vite's default (React) transform. Runs `use` with the module, then closes
 * the server.
 */
async function withModule<T>(
  file: string,
  use: (loaded: LoadedModule) => Promise<T> | T,
): Promise<T> {
  const root = await appRootOf(file)
  const server = await createServer({
    root,
    configFile: false,
    envFile: false,
    logLevel: 'silent',
    appType: 'custom',
    clearScreen: false,
    plugins: await pluginsOf(root),
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    ssr: { external: true },
  })
  let runner: ModuleRunner | undefined
  try {
    runner = createServerModuleRunner(server.environments.ssr, { hmr: false })
    const exports = await runner.import(await realpath(file))
    // The router package the app's modules import: an external module,
    // recorded under its name.
    const routers = [...runner.evaluatedModules.idToModuleMap.values()]
      .filter((node) => routerPackages.test(node.url))
      .map((node) => ({ name: node.url, exports: node.exports }))
    if (routers.length > 1) {
      throw new Error(
        `The app imports ${routers.length} router packages: ${routers.map(({ name }) => name).join(', ')}`,
      )
    }
    return await use({ exports, runner, router: routers[0] })
  } finally {
    await runner?.close()
    await server.close()
  }
}

/**
 * Evaluates `code` as a module of an app (a file named `fileName` in a new
 * temporary app) with the real router packages. Returns its exports and the
 * router package it imports (its own exports, to compare bindings with).
 */
export async function evaluateModule(code: string, fileName = 'route.tsx') {
  const root = await mkdtemp(path.join(tmpdir(), 'tsr-module-'))
  try {
    const file = path.join(root, fileName)
    await writeFile(file, code)
    return await withModule(file, ({ exports, router }) => ({
      exports,
      router: router?.exports,
    }))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

/** A route of the real router. */
export interface RouterRoute {
  id: string
  fullPath: string
  path?: string
  parentRoute?: RouterRoute
  options: Record<string, any>
}

/** A generated route tree loaded by the app, and the router built from it. */
export interface LoadedRouteTree {
  /** The real router (`createRouter` of the app's router package). */
  router: {
    routeTree: RouterRoute
    routesById: Record<string, RouterRoute>
    matchRoutes: (pathname: string) => Array<{ routeId: string }>
    [key: string]: any
  }
  /** The app's router package, as the app's modules import it. */
  routerPackage: Record<string, any>
  /** `react` or `vue`. */
  framework: string
  /**
   * The module file (relative to the tree, `/` separated) whose `Route`
   * export is the route `routeId` of the router; null for a route the tree
   * creates itself.
   */
  fileOf: (routeId: string) => string | null
  /** Imports a module of the app (absolute path) like the tree's imports. */
  import: (file: string) => Promise<Record<string, any>>
  /**
   * Server-renders `component` with the app's framework (Vue only), after
   * loading it if it is a lazily loaded route component (`preload`).
   */
  render: (component: unknown) => Promise<string>
  /**
   * Server-renders the app at `url` (Vue only): a new router over the tree
   * with a memory history at `url` loads the location, and its
   * `RouterProvider` renders.
   */
  renderAt: (url: string) => Promise<string>
}

/**
 * Loads the generated route tree at `treeFile` like the app does, builds the
 * router, and runs `use` with them. Fails like a bundler or the router on a
 * module that does not load or a tree the router rejects.
 */
export function withRouteTree<T>(
  treeFile: string,
  use: (tree: LoadedRouteTree) => Promise<T> | T,
): Promise<T> {
  return withModule(treeFile, async ({ exports, runner, router: imported }) => {
    if (!imported) {
      throw new Error('The app imports no router package')
    }
    const routerPackage = imported.exports
    const framework = routerPackages.exec(imported.name)![1]!
    const { routeTree } = exports
    const router = routerPackage.createRouter({
      routeTree,
      history: routerPackage.createMemoryHistory(),
    })
    const treeDir = path.dirname(await realpath(treeFile))
    const fileOf = (routeId: string) => {
      const route = router.routesById[routeId]
      if (!route) {
        throw new Error(`The router has no route ${routeId}`)
      }
      for (const [file, nodes] of runner.evaluatedModules.fileToModulesMap) {
        if ([...nodes].some((node) => node.exports?.Route === route)) {
          return path.relative(treeDir, file).replaceAll(path.sep, '/')
        }
      }
      return null
    }
    const renderVue = async (render: () => unknown) => {
      if (framework !== 'vue') {
        throw new Error(`No ${framework} server renderer in this package`)
      }
      // (the Vue the app's modules import: Node loads packages)
      const { createSSRApp } = await import('vue')
      const { renderToString } = await import('vue/server-renderer')
      return renderToString(createSSRApp({ render }))
    }
    return use({
      router,
      routerPackage,
      framework,
      fileOf,
      import: (file) => runner.import(file),
      render: async (component: any) => {
        await component?.preload?.()
        const { h } = await import('vue')
        return renderVue(() => h(component))
      },
      renderAt: async (url) => {
        const pageRouter = routerPackage.createRouter({
          routeTree,
          history: routerPackage.createMemoryHistory({ initialEntries: [url] }),
        })
        await pageRouter.load()
        const { h } = await import('vue')
        return renderVue(() =>
          h(routerPackage.RouterProvider, { router: pageRouter }),
        )
      },
    })
  })
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
  return withRouteTree(treeFile, ({ router, fileOf }) =>
    Object.fromEntries(
      Object.keys(router.routesById).map((id) => [id, fileOf(id)]),
    ),
  )
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
