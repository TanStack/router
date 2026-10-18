/**
 * Shared test helper: a generated route tree as the app gets it. The tree and
 * the modules it imports are loaded by a real Vite server with the app's
 * framework plugin (`@vitejs/plugin-vue` for single-file components,
 * `vite-plugin-solid` for Solid JSX), and the app's own router package
 * (`@tanstack/react-router`, `@tanstack/solid-router`, `@tanstack/vue-router`)
 * builds a real router from it with `createRouter`. Route ids, full paths,
 * parents, matching and lazily loaded options are the router's, and pages
 * render with the framework's own server renderer; nothing here derives them.
 */
import { existsSync } from 'node:fs'
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, createServerModuleRunner } from 'vite'
import type { PluginOption, ViteDevServer } from 'vite'
import type { ModuleRunner } from 'vite/module-runner'

/** This package's dependencies, for apps to import their packages from. */
const nodeModules = path.resolve(import.meta.dirname, '../node_modules')

/** The entry file of a router package, and the framework it is for. */
const routerPackageFile =
  /[\\/](react|solid|vue)-router[\\/]dist[\\/][^\\/]+[\\/]index(?:\.dev)?\.[cm]?jsx?$/

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

/** The frameworks of an app that need a Vite plugin. */
interface Frameworks {
  vue: boolean
  solid: boolean
}

/**
 * The frameworks of the app whose sources are in `dir` (not in its
 * `node_modules`): Vue when it has single-file components, Solid when its
 * modules import Solid.
 */
async function frameworksIn(
  dir: string,
  found: Frameworks = { vue: false, solid: false },
) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        await frameworksIn(file, found)
      }
    } else if (entry.name.endsWith('.vue')) {
      found.vue = true
    } else if (
      !found.solid &&
      /\.[cm]?[jt]sx?$/.test(entry.name) &&
      /from\s*['"](?:@tanstack\/solid-router|solid-js)['"/]/.test(
        await readFile(file, 'utf8'),
      )
    ) {
      found.solid = true
    }
  }
  return found
}

/**
 * Creates a Vite dev server for apps with `frameworks`, configured like such
 * an app would configure Vite: the Vue plugin for single-file components,
 * the Solid plugin for Solid (with Solid's own choice of which packages to
 * bundle for the server; otherwise Node loads the packages). The plugins are
 * loaded only when needed: they are large.
 */
async function createAppServer(frameworks: Frameworks, root: string) {
  const plugins: Array<PluginOption> = []
  if (frameworks.vue) {
    const { default: vue } = await import('@vitejs/plugin-vue')
    plugins.push(vue())
  }
  if (frameworks.solid) {
    const { default: solid } = await import('vite-plugin-solid')
    plugins.push(solid({ ssr: true }))
  }
  return createServer({
    root,
    configFile: false,
    envDir: false,
    logLevel: 'silent',
    appType: 'custom',
    clearScreen: false,
    plugins,
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    ssr: frameworks.solid ? {} : { external: true },
  })
}

/**
 * The dev server Solid apps share in a worker: they bundle the Solid
 * router's sources for the server, and compiling them again for every load
 * would take most of a second. Nothing of an app is reused between loads
 * (`withModule`).
 */
let solidServer: Promise<ViteDevServer> | undefined

/** A module of the app, loaded by a Vite server of the app. */
interface LoadedModule {
  /** The module's exports. */
  exports: Record<string, any>
  /** The module runner that loaded it, with the modules it evaluated. */
  runner: ModuleRunner
}

/**
 * Loads `file` (absolute path) like its app's dev server does for server
 * rendering, with a Vite server configured for the app's frameworks (from
 * the sources next to `file`) and a fresh module runner: a new server rooted
 * at the app, or for a Solid app the shared Solid server, which first forgets
 * every module of the app so that an edited or regenerated file is
 * transformed again. JSX in the `.tsx`/`.jsx` files of a React or Vue app
 * compiles with Vite's default (React) transform. Runs `use` with the module.
 */
async function withModule<T>(
  file: string,
  use: (loaded: LoadedModule) => Promise<T> | T,
): Promise<T> {
  const root = await appRootOf(file)
  const realFile = await realpath(file)
  const frameworks = await frameworksIn(path.dirname(realFile))
  let server: ViteDevServer
  if (frameworks.solid && !frameworks.vue) {
    solidServer ??= realpath(tmpdir()).then((dir) =>
      createAppServer(frameworks, dir),
    )
    server = await solidServer
    const { moduleGraph } = server.environments.ssr
    for (const module of moduleGraph.idToModuleMap.values()) {
      if (
        module.file?.startsWith(root + path.sep) &&
        !module.file
          .slice(root.length)
          .includes(`${path.sep}node_modules${path.sep}`)
      ) {
        moduleGraph.invalidateModule(module)
      }
    }
  } else {
    server = await createAppServer(frameworks, root)
  }
  const runner = createServerModuleRunner(server.environments.ssr, {
    hmr: false,
  })
  try {
    const exports = await runner.import(realFile)
    return await use({ exports, runner })
  } finally {
    await runner.close()
    if (server !== (await solidServer)) {
      await server.close()
    }
  }
}

/**
 * The router package the app's modules loaded (the instance they use), and
 * its framework; undefined when they loaded none.
 */
function routerPackageOf(runner: ModuleRunner) {
  const packages = new Map<unknown, { framework: string; exports: any }>()
  for (const node of runner.evaluatedModules.idToModuleMap.values()) {
    const framework = routerPackageFile.exec(node.id)?.[1]
    if (framework && typeof node.exports?.createRouter === 'function') {
      // (a development entry re-exports the same bindings)
      packages.set(node.exports.createRouter, {
        framework,
        exports: node.exports,
      })
    }
  }
  if (packages.size > 1) {
    throw new Error(`The app loaded ${packages.size} router packages`)
  }
  return [...packages.values()][0]
}

/**
 * Evaluates `code` as a module of an app (a file named `fileName` in a new
 * temporary app) with the real packages. Returns its exports and the router
 * package it imports (its own exports, to compare bindings with).
 */
export async function evaluateModule(code: string, fileName = 'route.tsx') {
  const root = await mkdtemp(path.join(tmpdir(), 'tsr-module-'))
  try {
    const file = path.join(root, fileName)
    await writeFile(file, code)
    return await withModule(file, ({ exports, runner }) => ({
      exports,
      router: routerPackageOf(runner)?.exports,
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
  /** `react`, `solid` or `vue`. */
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
   * Server-renders `component` with the app's framework, after loading it if
   * it is a lazily loaded route component (`preload`).
   */
  render: (component: unknown) => Promise<string>
  /**
   * Server-renders the app at `url`: a new router over the tree with a memory
   * history at `url` loads the location, and its `RouterProvider` renders.
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
  return withModule(treeFile, async ({ exports, runner }) => {
    const loaded = routerPackageOf(runner)
    if (!loaded) {
      throw new Error('The app loaded no router package')
    }
    const { framework, exports: routerPackage } = loaded
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
    /** Renders `Component` with `props` with the framework's renderer. */
    const renderElement = async (Component: any, props: object = {}) => {
      if (framework === 'vue') {
        // (the Vue the app's modules import: Node loads packages)
        const { createSSRApp, h } = await import('vue')
        const { renderToString } = await import('vue/server-renderer')
        return renderToString(
          createSSRApp({ render: () => h(Component, props) }),
        )
      }
      if (framework === 'react') {
        // (the React the app's modules import: Node loads packages)
        const { createElement } = await import('react')
        const { renderToString } = await import('react-dom/server')
        return renderToString(createElement(Component, props))
      }
      // Solid's server renderer, as the router package loaded it
      const web = [...runner.evaluatedModules.idToModuleMap.values()].find(
        (node) =>
          /[\\/]solid-js[\\/]web[\\/]dist[\\/]/.test(node.id) &&
          typeof node.exports?.renderToStringAsync === 'function',
      )?.exports
      if (!web) {
        throw new Error('The app loaded no solid-js/web')
      }
      return web.renderToStringAsync(() =>
        web.createComponent(Component, props),
      )
    }
    return use({
      router,
      routerPackage,
      framework,
      fileOf,
      import: (file) => runner.import(file),
      render: async (component: any) => {
        await component?.preload?.()
        return renderElement(component)
      },
      renderAt: async (url) => {
        const pageRouter = routerPackage.createRouter({
          routeTree,
          history: routerPackage.createMemoryHistory({ initialEntries: [url] }),
        })
        await pageRouter.load()
        return renderElement(routerPackage.RouterProvider, {
          router: pageRouter,
        })
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
