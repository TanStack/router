/**
 * Vite host of the router compiler (see the compiler README, "Hosts"): one native plugin per
 * compiler instance with hook filters. `transform` compiles every id of a
 * route module it is handed text for (the env id and the derived
 * `?tsr-split=` ids alike, from the text the bundler hands it, so upstream
 * transforms and maps apply to every id); `resolveId` resolves the owned-query
 * specifiers of the glue without touching the file system; `watchChange`
 * is the one invalidation operation; diagnostics go through the warning
 * ledger to `this.warn`. Dev or build is the bundler's command, never
 * `process.env.NODE_ENV`, which is unset or wrong in many setups.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  OWNED_QUERY_RE,
  SourceText,
  identify,
  isFinalBuild,
  releaseEnvironment,
  resolveDerivedSibling,
} from '@tanstack/router-utils/compiler'
import { getConfig } from '../core/config'
import {
  changedRoutePaths,
  onRoutesChanged,
} from '../core/router-plugin-context'
import { JS_ID_RE, RouterCompiler, normalizePath } from './session'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { Config } from '../core/config'
import type { Diagnostic, PlanKey } from '@tanstack/router-utils/compiler'
import type { Plugin, Rollup, ViteDevServer } from 'vite'

export const CODE_SPLITTER_PLUGIN_NAME =
  'tanstack-router:code-splitter:compile-reference-file'

type TransformationPluginInfo = {
  pluginNames: Array<string>
  pkg: string
  usage: string
}

/**
 * JSX transformation plugins grouped by framework.
 * These plugins must come AFTER the TanStack Router plugin in the Vite config.
 */
const TRANSFORMATION_PLUGINS_BY_FRAMEWORK: Record<
  string,
  Array<TransformationPluginInfo>
> = {
  react: [
    {
      // Babel-based React plugin
      pluginNames: ['vite:react-babel', 'vite:react-refresh'],
      pkg: '@vitejs/plugin-react',
      usage: 'react()',
    },
    {
      // SWC-based React plugin
      pluginNames: ['vite:react-swc', 'vite:react-swc:resolve-runtime'],
      pkg: '@vitejs/plugin-react-swc',
      usage: 'reactSwc()',
    },
    {
      // OXC-based React plugin (deprecated but should still be handled)
      pluginNames: ['vite:react-oxc:config', 'vite:react-oxc:refresh-runtime'],
      pkg: '@vitejs/plugin-react-oxc',
      usage: 'reactOxc()',
    },
  ],
  solid: [
    {
      pluginNames: ['solid'],
      pkg: 'vite-plugin-solid',
      usage: 'solid()',
    },
  ],
}

export type RouterPluginOptions = Partial<Config | (() => Config)> | undefined

interface ModuleGraphLike {
  getModulesByFile: (file: string) => Set<unknown> | undefined
  invalidateModule: (
    mod: unknown,
    seen: Set<unknown>,
    timestamp: number,
    isHmr: boolean,
    softInvalidate: boolean,
  ) => void
}

interface TransformEnvironment {
  name: string
  config: {
    consumer: 'client' | 'server'
    build?: { sourcemap?: unknown; write?: boolean; watch?: unknown }
  }
}

interface DiagnosticLog {
  message: string
  id?: string
  loc?: { file: string; line: number; column: number }
}

function logOf(d: Diagnostic, source: SourceText, file: string): DiagnosticLog {
  if (!d.range) {
    return { message: d.message, id: file }
  }
  const at = source.locate(d.range.start)
  return {
    message: d.message,
    id: file,
    loc: { file, line: at.line + 1, column: at.column },
  }
}

/**
 * The router compiler as a Vite plugin: route splitting (`autoCodeSplitting`)
 * and route HMR (`codeSplittingOptions.addHmr`, dev client envs only).
 */
const EXTRACTED_EXPORT_RE = /[?&]tsr-split=export~([^&#]+)/

export function createRouterCompilerVitePlugin(
  options: RouterPluginOptions = {},
  routerPluginContext: RouterPluginContext,
): Plugin {
  let ROOT: string = process.cwd()
  let userConfig: Config
  let compiler: RouterCompiler
  let server: ViteDevServer | null = null
  let unsubscribe: (() => void) | null = null
  let buildSourcemap = true
  let firstEnvironment: string | undefined

  const resolveUserConfig = () =>
    typeof options === 'function' ? options() : getConfig(options, ROOT)

  const hardInvalidate = (keys: Array<PlanKey>) => {
    if (!server || keys.length === 0) {
      return
    }
    const seen = new Set<unknown>()
    const now = Date.now()
    const environments = (
      server as unknown as {
        environments?: Record<string, { moduleGraph: ModuleGraphLike }>
      }
    ).environments
    const fallback = (server as unknown as { moduleGraph?: ModuleGraphLike })
      .moduleGraph
    for (const key of keys) {
      const file = identify(key.canonicalId).path
      const graph = environments?.[key.env]?.moduleGraph ?? fallback
      const mods = graph?.getModulesByFile(file)
      if (!graph || !mods) {
        continue
      }
      for (const mod of mods) {
        graph.invalidateModule(mod, seen, now, true, false)
      }
    }
  }

  const invalidatePath = async (
    file: string,
    kind: 'change' | 'add' | 'unlink' | 'registry',
  ) => {
    const res = await compiler.invalidate(normalizePath(file), kind)
    hardInvalidate([...res.evicted, ...res.dependents])
  }

  const plugin: Plugin = {
    name: CODE_SPLITTER_PLUGIN_NAME,
    enforce: 'pre',

    config(userViteConfig) {
      ROOT = path.resolve(userViteConfig.root ?? process.cwd())
      // The dev-only route HMR block imports the framework's `/hmr` subpath,
      // which no source file imports: pre-bundle it with the package rather
      // than discovering it on the first route module (a re-optimization and
      // a page reload).
      return {
        optimizeDeps: {
          include: [`@tanstack/${resolveUserConfig().target}-router/hmr`],
        },
      }
    },

    configResolved(config) {
      firstEnvironment = Object.keys(config.environments)[0]
      ROOT = config.root
      userConfig = resolveUserConfig()
      buildSourcemap = config.build.sourcemap !== false
      compiler = new RouterCompiler({
        context: routerPluginContext,
        config: userConfig,
        bundler: 'vite',
        mode: config.command === 'build' ? 'build' : 'dev',
        hmrStyle: userConfig.plugin?.hmr?.style ?? 'vite',
      })
      unsubscribe?.()
      unsubscribe = onRoutesChanged(routerPluginContext, (next, previous) => {
        for (const file of changedRoutePaths(next, previous)) {
          void invalidatePath(file, 'registry')
        }
      })

      // Validate plugin order - router must come before JSX transformation
      // plugins. Only route splitting needs the route file's source: without
      // it (`autoCodeSplitting: false`) the route HMR block is appended to
      // whatever the framework plugin emitted, so the order is free.
      if (!userConfig.autoCodeSplitting) {
        return
      }
      const routerPluginIndex = config.plugins.findIndex(
        (p) => p.name === CODE_SPLITTER_PLUGIN_NAME,
      )
      if (routerPluginIndex === -1) {
        return
      }
      const frameworkPlugins =
        TRANSFORMATION_PLUGINS_BY_FRAMEWORK[userConfig.target]
      if (!frameworkPlugins) {
        return
      }
      for (const transformPlugin of frameworkPlugins) {
        const transformPluginIndex = config.plugins.findIndex((p) =>
          transformPlugin.pluginNames.includes(p.name),
        )
        if (
          transformPluginIndex !== -1 &&
          transformPluginIndex < routerPluginIndex
        ) {
          throw new Error(
            `Plugin order error: '${transformPlugin.pkg}' is placed before '@tanstack/router-plugin'.\n\n` +
              `The TanStack Router plugin must come BEFORE JSX transformation plugins.\n\n` +
              `Please update your Vite config:\n\n` +
              `  plugins: [\n` +
              `    tanstackRouter(),\n` +
              `    ${transformPlugin.usage},\n` +
              `  ]\n`,
          )
        }
      }
    },

    applyToEnvironment(environment) {
      if (userConfig.plugin?.vite?.environmentName) {
        return userConfig.plugin.vite.environmentName === environment.name
      }
      return true
    },

    configureServer(viteServer) {
      server = viteServer
      viteServer.httpServer?.once('close', () => {
        unsubscribe?.()
        unsubscribe = null
      })
    },

    buildStart() {
      // one warning per file per run (J2.19): a build of several environments
      // (Vite's builder) starts each in turn; the first configured
      // environment starts the run
      const environment = (
        this as unknown as { environment?: { name: string } }
      ).environment
      if (
        compiler.mode === 'build' &&
        (environment === undefined || environment.name === firstEnvironment)
      ) {
        compiler.warnings.reset()
      }
    },

    closeBundle() {
      if (compiler.mode !== 'build') {
        return
      }
      unsubscribe?.()
      unsubscribe = null
      // the environment's build is finished: its plans go before the next
      // environment builds
      const environment = (
        this as unknown as { environment?: TransformEnvironment }
      ).environment
      if (environment && isFinalBuild(environment.config.build)) {
        releaseEnvironment(compiler.caches, environment.name)
      }
    },

    generateBundle(_options, bundle) {
      const environment = (
        this as unknown as { environment?: TransformEnvironment }
      ).environment
      if (environment && environment.config.consumer !== 'client') {
        return
      }
      // extracted-export outputs that an entry chunk (or a chunk it imports
      // statically) holds are eager whatever the splitter did: say so (J2.8)
      const chunks = Object.values(bundle).filter(
        (c): c is Rollup.OutputChunk => c.type === 'chunk',
      )
      const byName = new Map(chunks.map((c) => [c.fileName, c]))
      const eager = new Set<string>()
      const queue = chunks.filter((c) => c.isEntry).map((c) => c.fileName)
      while (queue.length > 0) {
        const name = queue.pop()!
        // a chunk's imports also name what the build leaves external
        // (`build.rolldownOptions.external`, a library build): not chunks
        const chunk = byName.get(name)
        if (!chunk || eager.has(name)) {
          continue
        }
        eager.add(name)
        queue.push(...chunk.imports)
      }
      const seen = new Set<string>()
      for (const name of eager) {
        for (const id of Object.keys(byName.get(name)!.modules)) {
          const match = EXTRACTED_EXPORT_RE.exec(id)
          if (!match) {
            continue
          }
          const file = normalizePath(identify(id).path)
          const exportName = decodeURIComponent(match[1]!)
          const key = `${file}\0${exportName}`
          if (seen.has(key)) {
            continue
          }
          seen.add(key)
          this.warn(
            `[tanstack-router] The export \`${exportName}\` of "${file}" loads with the entry chunk, not with the route's split code: a module of the entry imports it through the route file. Move it to its own module so the route's chunks and the importer share it without the route file.`,
          )
        }
      }
    },

    resolveId: {
      filter: { id: OWNED_QUERY_RE },
      handler(source, importer) {
        return resolveDerivedSibling(source, importer)
      },
    },

    load: {
      filter: { id: OWNED_QUERY_RE },
      async handler(id) {
        // a derived id of a file of the project (`route.tsx?tsr-split=…`) is
        // the file's own text, read here: Vite's load fallback cleans the id
        // of its query and fragment, and a `#` of a project path (`C#`,
        // `project #2`) would end the path there. A derived id with a foreign
        // query (`.vue?vue&…`) or of a virtual module is its owner's to load.
        const identity = identify(id)
        if (
          identity.derived === null ||
          identity.foreignQuery !== '' ||
          identity.path.startsWith('\0') ||
          !compiler.wants(id)
        ) {
          return null
        }
        const code = await readFile(identity.path, 'utf8').catch(() => null)
        if (code === null) {
          return null
        }
        this.addWatchFile(identity.path)
        return code
      },
    },

    transform: {
      filter: { id: { include: JS_ID_RE } },
      async handler(code, id, opts) {
        if (!compiler.wants(id)) {
          return null
        }
        const identity = identify(id)
        if (identity.lang === null) {
          return null
        }
        const file = normalizePath(identity.path)
        const entry = compiler.routeEntry(file)
        if (!entry) {
          // a derived id of a file that is no longer a route module (J2.13)
          return identity.derived
            ? { code: 'export {}\n', map: { mappings: '' } }
            : null
        }
        const environment = (
          this as unknown as { environment?: TransformEnvironment }
        ).environment
        const ssr = opts?.ssr === true
        const envName = environment?.name ?? (ssr ? 'ssr' : 'client')
        const envType: 'client' | 'server' = environment
          ? environment.config.consumer === 'server'
            ? 'server'
            : 'client'
          : ssr
            ? 'server'
            : 'client'
        if (!compiler.appliesTo(envType)) {
          return null
        }
        const envSourcemap = environment?.config.build?.sourcemap
        const wantMap =
          compiler.mode === 'dev'
            ? true
            : envSourcemap !== undefined
              ? envSourcemap !== false
              : buildSourcemap
        const out = await compiler.compile({
          id,
          code,
          env: { name: envName, type: envType },
          wantMap,
        })
        if (!out) {
          return null
        }
        if (out.diagnostics.length > 0) {
          const source = new SourceText(code)
          compiler.report(out, file, (d) => {
            const log = logOf(d, source, identity.path)
            if (d.severity === 'error') {
              this.error(log)
            }
            this.warn(log)
          })
        }
        if (identity.derived === null && out.code === code) {
          return null
        }
        return {
          code: out.code,
          map: out.map,
          moduleSideEffects: out.sideEffectFree ? false : undefined,
        }
      },
    },

    hotUpdate({ modules }) {
      // Derived modules of a layout the file no longer has (an extracted
      // export once the export went, a split chunk once the file stopped
      // splitting) stay in Vite's module graph without importers: nothing on
      // the page holds them, and an update of theirs can only dead-end into a
      // full reload. The update is of the live modules.
      return liveModules(modules)
    },

    async watchChange(id, { event }) {
      const kind =
        event === 'update' ? 'change' : event === 'create' ? 'add' : 'unlink'
      await invalidatePath(id, kind)
    },
  }
  return plugin
}

/**
 * The modules of a file's hot update that something still imports: a
 * derived module (`?tsr-split=…`) without importers is of a layout the file
 * no longer has (Vite's module graph keeps it). `undefined` when all are live.
 */
export function liveModules<
  T extends { id: string | null; importers: ReadonlySet<unknown> },
>(modules: Array<T>): Array<T> | undefined {
  const live = modules.filter(
    (m) =>
      !(
        m.id !== null &&
        identify(m.id).derived !== null &&
        m.importers.size === 0
      ),
  )
  return live.length === modules.length ? undefined : live
}
