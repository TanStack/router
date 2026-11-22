import { realpath, realpathSync } from 'node:fs'
import { isAbsolute, normalize, relative } from 'node:path'
import { promisify } from 'node:util'
import {
  Generator,
  createGeneratorSession,
  logging,
  resolveConfigPath,
} from '@tanstack/router-generator'
import {
  identify,
  normalizePath,
  webpackResourceId,
} from '@tanstack/router-utils/compiler'
import { getConfig } from './config'
import {
  contextInternals,
  createRouterPluginContext,
  publishRoutes,
} from './router-plugin-context'

import type { UnpluginFactory } from 'unplugin'
import type { ViteDevServer } from 'vite'
import type { Config } from './config'
import type { RouterPluginContext } from './router-plugin-context'

const PLUGIN_NAME = 'unplugin:router-generator'

/** The file of a webpack module's resource, normalised. */
const fileOf = (resource: string) =>
  normalizePath(identify(webpackResourceId(resource)).path)

/**
 * (Node's real path in JavaScript, which resolves link by link as webpack's
 * and Rspack's resolvers do; the native one can differ on some Windows
 * drives)
 */
const realPathOf = promisify(realpath)

/**
 * The files of `written` that still exist, as the generator named them and
 * at their real paths (a linked directory on the way resolved: the path the
 * bundler resolves their modules to).
 */
async function existingFiles(written: Iterable<string>) {
  const files = new Set<string>()
  await Promise.all(
    [...written].map(async (file) => {
      try {
        const real = await realPathOf(file)
        files.add(file)
        files.add(real)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
    }),
  )
  return files
}

/**
 * Vite dev: the modules of the files a generator run replaced, in every
 * environment, under the path as named and under its real path, are
 * invalidated when the run is published: the next request transforms them
 * from the disk, whether or not Vite's watcher reports the write (it drops a
 * second change of a file within 50 ms, a plugin may hold or filter the
 * event, the module may be keyed by the real path). Nothing is sent and
 * nothing waits.
 */
function invalidateReplacedFiles(
  server: ViteDevServer,
  replaced: Iterable<string>,
) {
  const paths = new Set<string>()
  for (const file of replaced) {
    paths.add(normalizePath(file))
    try {
      paths.add(normalizePath(realpathSync(file)))
    } catch {
      // (gone: its modules are under the path as named)
    }
  }
  for (const environment of Object.values(server.environments)) {
    const { moduleGraph } = environment
    for (const file of paths) {
      for (const mod of moduleGraph.getModulesByFile(file) ?? []) {
        moduleGraph.invalidateModule(mod)
      }
    }
  }
}

export function createRouterGeneratorPlugin(
  options: Partial<Config | (() => Config)> | undefined = {},
  routerPluginContext: RouterPluginContext,
): ReturnType<UnpluginFactory<Partial<Config | (() => Config)> | undefined>> {
  // a context the factory didn't make fails here, not at the first publication
  contextInternals(routerPluginContext)
  let ROOT: string = process.cwd()
  let userConfig: Config
  let generator: Generator
  /** Vite dev: watches the route roots outside Vite's root. */
  let watchOutsideRoot: (() => void) | undefined
  /** Rspack/webpack watch mode: the generator's own watcher reports every route file event. */
  let watching = false
  /** Vite: the config resolution under way was given this plugin (its `config` ran). */
  let submitted = false
  /**
   * Vite build: the warnings the generations of the build's config
   * resolutions printed, so each prints once per build (plugin objects
   * passed inline are given to the top-level resolution and to each
   * environment's, and generate in each). The build's start ends them.
   */
  let printed: Set<string> | undefined
  /**
   * Rspack/webpack watch mode: the files the generator replaced that no
   * compilation took yet (`watchRun`), as it named them and as it replaced
   * them. A write can come before the `watchRun` of its compilation (the
   * generator's own watcher), or during the compilation (the next one
   * takes it).
   */
  let unbuilt = new Set<string>()
  /** Vite dev: the dev server, and the files the generator replaced since the last publication. */
  let devServer: ViteDevServer | undefined
  let replaced = new Set<string>()
  const session = createGeneratorSession({
    generator: () => generator,
    publish: (routesByFile, failure) => {
      publishRoutes(routerPluginContext, routesByFile, failure)
      if (devServer && replaced.size > 0) {
        const files = replaced
        replaced = new Set()
        invalidateReplacedFiles(devServer, files)
      }
    },
  })
  /** A new config resolution, or the end of the dev server's environments: no dev server (yet). */
  const forgetDevServer = () => {
    devServer = undefined
    watchOutsideRoot = undefined
    replaced = new Set()
  }

  const initConfigAndGenerator = (opts?: { root?: string }) => {
    if (opts?.root) {
      ROOT = opts.root
    }
    if (typeof options === 'function') {
      userConfig = options()
    } else {
      userConfig = getConfig(options, ROOT)
    }
    const logger = logging({ disabled: userConfig.disableLogging })
    // (a run of the generator this one replaces may still be in flight)
    ;(generator as Generator | undefined)?.retire()
    const created: Generator = new Generator({
      config: userConfig,
      root: ROOT,
      onWrite: ({ destination, file }) => {
        if (watching) {
          unbuilt.add(destination)
          unbuilt.add(file)
        }
        if (devServer) {
          replaced.add(destination)
          replaced.add(file)
        }
      },
      logger: {
        ...logger,
        warn: (...args) => {
          const text = args.join(' ')
          // (a retired generator's late run warns no one)
          if (created !== generator || printed?.has(text)) {
            return
          }
          printed?.add(text)
          logger.warn(...args)
        },
      },
    })
    generator = created
  }

  const isConfigFile = (file: string) =>
    normalize(file) === resolveConfigPath({ configDirectory: ROOT })

  /**
   * Rspack/webpack watch mode: hands the generator the compiler's changes
   * and waits for its run. Gives the files the generator replaced since the
   * last `watchRun` (the route tree, route files it kept up) that still
   * exist (`existingFiles`). The compiler fixed the compilation's changed
   * files before `watchRun`, so the compilation would build those from
   * their old content (and the route tree's module would import a deleted
   * route file); their own events start the next compilation.
   */
  const watchRun = async (compiler: {
    modifiedFiles?: ReadonlySet<string>
    removedFiles?: ReadonlySet<string>
  }) => {
    watching = true
    await session.watchRun(
      compiler.modifiedFiles ?? [],
      compiler.removedFiles ?? [],
    )
    if (unbuilt.size === 0) {
      return unbuilt
    }
    const written = unbuilt
    unbuilt = new Set()
    return existingFiles(written)
  }

  return {
    name: 'tanstack:router-generator',
    enforce: 'pre',
    buildStart() {
      printed = undefined
    },
    async watchChange(id, { event }) {
      if (isConfigFile(id)) {
        initConfigAndGenerator()
        if (watching) {
          await session.close()
          await session.watch()
        }
        watchOutsideRoot?.()
        return
      }
      // (Rspack/webpack: the session hands the compiler's events over itself)
      if (watching) {
        return
      }
      await session.run({ path: normalize(id), type: event })
      watchOutsideRoot?.()
    },
    vite: {
      config() {
        submitted = true
      },
      async configResolved(config) {
        if (config.command === 'build' && !submitted) {
          // Vite shared this plugin into an environment's config resolution
          // of the same build (`builder.sharedPlugins`): it ran `config` on
          // the plugins that resolution was given (the config file's new
          // ones), then swapped in the top-level ones. The top-level
          // resolution generated the tree: same root and options, no file
          // event in between. A plugin object passed inline is given to
          // every resolution, and generates in each.
          return
        }
        submitted = false
        forgetDevServer()
        if (config.command === 'build') {
          printed ??= new Set()
        }
        initConfigAndGenerator({ root: config.root })
        if (config.command !== 'build') {
          await session.run()
        } else if (
          config.build.watch ||
          Object.values(config.environments).some(
            (environment) => environment.build.watch,
          )
        ) {
          // An environment of the build watches (its own `build.watch`, or
          // the top level's it inherits). Rolldown's and Rollup's watchers
          // report the files of the bundle only (`watchChange`): route files
          // created, or outside the bundle, come from the generator's own
          // watcher, whose route tree makes the build compile again. Its
          // first run generates the tree. (A plugin object passed inline
          // generates in each resolution: the new generator gets a new
          // watcher.)
          await session.close()
          await session.watch()
        } else {
          await session.build()
        }
      },
      closeWatcher() {
        void session.close()
      },
      // (Vite dev calls it when the dev server's environments close)
      closeBundle() {
        forgetDevServer()
      },
      configureServer(server) {
        devServer = server
        // Vite's watcher reports the files under its root (watchChange);
        // the routes may also come from outside it (`physical()` mounts,
        // the virtual route config): those are watched too (SPEC J1.10).
        const addOutsideRoot = () => {
          const { directories, files } = generator.watchTargets()
          const outside = [...directories, ...files].filter((target) => {
            const fromRoot = relative(server.config.root, target)
            return fromRoot.startsWith('..') || isAbsolute(fromRoot)
          })
          if (outside.length) {
            server.watcher.add(outside)
          }
        }
        addOutsideRoot()
        watchOutsideRoot = addOutsideRoot
      },
    },
    rspack(compiler) {
      initConfigAndGenerator()
      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => session.build())
      // The compiler's watcher sees the files of the bundle only: route files
      // created, or outside the bundle (unparsable, `physical()` mounts), come
      // from the generator's own watcher.
      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async (c) => {
        const written = await watchRun(c)
        if (written.size === 0) {
          return
        }
        // The files the generator wrote join this compilation's changes, so
        // it builds them from what it wrote, before it resolves anything (a
        // compilation that stops at its first error included). This relies
        // on Rspack reading `modifiedFiles`/`removedFiles` after the
        // `watchRun` hooks, when it starts the rebuild (`Compiler.compile`:
        // `instance.rebuild([...this.modifiedFiles], …)`; @rspack/core
        // 2.3.1, 2.2.9 and 1.0.14 by source): replacing the sets there is
        // not a documented contract (the hook's documentation only reads
        // them). The watcher's own sets are not mutated.
        c.modifiedFiles = new Set([...(c.modifiedFiles ?? []), ...written])
        if (c.removedFiles && c.removedFiles.size > 0) {
          c.removedFiles = new Set(
            [...c.removedFiles].filter((file) => !written.has(file)),
          )
        }
      })
      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        void session.close()
      })
    },
    webpack(compiler) {
      initConfigAndGenerator()
      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => session.build())
      // See rspack above
      /** The files the generator wrote for the compilation the last `watchRun` started (`fileOf` spelling). */
      let written = new Set<string>()
      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async (c) => {
        const files = await watchRun(c)
        written = new Set([...files].map(normalizePath))
        // (webpack read the files before: its input file system would give
        // the old content)
        if (files.size > 0) {
          compiler.inputFileSystem?.purge?.([...files])
        }
      })
      // webpack decides from the files' timestamps, not from its change
      // set: it checks a cached module's snapshot first, which it took
      // before the generator wrote, and asks `needBuild` only about a module
      // that check would reuse; the modules whose resource is a file the
      // generator wrote for this compilation answer true there and are built
      // again (rebuilding them at `finishMake` would leave the error the
      // tree's old imports gave at `make`). A module of another resource
      // that declares a written file as an input is reused (KNOWN-BUGS,
      // accepted limit).
      compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
        const files = written
        written = new Set()
        if (files.size === 0) {
          return
        }
        compiler.webpack.NormalModule.getCompilationHooks(
          compilation,
        ).needBuild.tapAsync(PLUGIN_NAME, (module, _context, callback) => {
          if (files.has(fileOf(module.resource))) {
            callback(null, true)
          } else {
            // (no answer: webpack reuses the module)
            callback()
          }
        })
      })
      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        void session.close()
      })
      compiler.hooks.done.tap(PLUGIN_NAME, () => {
        console.info('✅ ' + PLUGIN_NAME + ': route-tree generation done')
      })
    },
    esbuild: {
      config() {
        initConfigAndGenerator()
      },
      // Every build and rebuild (esbuild watches the files of the bundle
      // only, and reports no file events to plugins: `watchChange` never
      // runs)
      setup(build) {
        build.onStart(() => session.build())
      },
    },
  }
}

export const unpluginRouterGeneratorFactory: UnpluginFactory<
  Partial<Config | (() => Config)> | undefined
> = (options = {}) => {
  return createRouterGeneratorPlugin(options, createRouterPluginContext())
}
