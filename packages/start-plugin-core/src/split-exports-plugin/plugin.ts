import { logDiff } from '@tanstack/router-utils'
import { normalizePath } from 'vite'
import { TRANSFORM_ID_REGEX } from '../constants'
import type { ModuleLoaderApi } from '../module-loader-plugin/plugin'
import { findModuleLoaderApi, stripQueryString } from '../plugin-utils'
import {
  extractImportsFromModule,
  hasClassExports,
  transformExports,
  transformImports,
} from './compiler'
import {
  debug,
  hasDirectiveQuery,
  isParseableFile,
  shouldExclude,
} from './plugin-utils'
import {
  SPLIT_EXPORTS_QUERY_KEY,
  extractSplitExportsQuery,
  hasSplitExportsQuery,
  parseSplitExportsQuery,
  removeSplitExportsQuery,
} from './query-utils'
import type { GetConfigFn } from '../plugin'
import type { Plugin, PluginOption, ResolvedConfig } from 'vite'

/**
 * Determine if sourcemaps should be generated based on Vite config.
 * Returns true for 'inline', 'hidden', true, or any truthy string value.
 */
function shouldGenerateSourceMaps(config: ResolvedConfig | undefined): boolean {
  if (!config) return true // Default to generating sourcemaps if no config
  const sourcemap = config.build.sourcemap
  // sourcemap can be boolean, 'inline', 'hidden', or undefined
  return !!sourcemap
}

/**
 * Options for the split-exports plugin.
 */
export interface SplitExportsPluginOptions {
  /**
   * Enable or disable the plugin.
   * @default true
   */
  enabled?: boolean

  /**
   * Paths to exclude from transformation (glob patterns).
   * node_modules is always excluded.
   */
  exclude?: Array<string | RegExp>

  /**
   * Function to get the resolved Start config.
   * When provided, only files inside srcDirectory will be transformed.
   */
  getConfig?: GetConfigFn
}

/**
 * Plugin 1: Rewrite imports to add split-exports query parameters.
 * This runs early (enforce: 'pre') to add query strings before other plugins process the imports.
 */
function importRewriterPlugin(options: SplitExportsPluginOptions): Plugin {
  let srcDirectory: string | undefined
  let sourceMaps = true
  let loaderApi: ModuleLoaderApi | undefined

  // Cache for class export detection per resolved path
  // true = has class exports (skip), false = no class exports (can optimize)
  const classExportCache = new Map<string, boolean>()

  return {
    name: 'tanstack-split-exports:rewrite-imports',
    enforce: 'pre',

    configResolved(config) {
      // Resolve srcDirectory once when config is ready
      if (options.getConfig) {
        const { resolvedStartConfig } = options.getConfig()
        srcDirectory = resolvedStartConfig.srcDirectory
      }
      // Capture sourcemap setting from Vite config
      sourceMaps = shouldGenerateSourceMaps(config)
    },

    transform: {
      filter: {
        id: TRANSFORM_ID_REGEX,
      },
      async handler(code, id) {
        // Skip excluded paths (including files outside srcDirectory)
        // Note: We intentionally do NOT skip files with tss-split-exports query here.
        // A file like `foo.ts?tss-split-exports=Route` may still have imports
        // that need to be rewritten (e.g., `import { bar } from './bar'`).
        // The extractImportsFromModule function already skips imports that have
        // our query parameter, preventing infinite recursion.
        if (shouldExclude(id, srcDirectory, options.exclude)) {
          return null
        }

        // Quick check: skip files that don't contain import statements
        if (!code.includes('import')) {
          return null
        }

        // Extract all potential imports (including aliased ones like ~/ and @/)
        // Also get the AST to reuse in transformImports (avoids double parsing)
        const { imports: allImports, ast } = extractImportsFromModule(code)

        if (allImports.size === 0) {
          return null
        }

        // Get the module loader API (looked up once, then cached)
        if (!loaderApi) {
          loaderApi = findModuleLoaderApi(this.environment.plugins)
        }

        // Resolve all imports in parallel for better performance
        const importEntries = Array.from(allImports.entries())
        const resolutions = await Promise.all(
          importEntries.map(async ([source]) => {
            const resolved = await this.resolve(source, id, { skipSelf: true })
            return { source, resolved }
          }),
        )

        // Build a map of source -> resolved path for filtering
        const resolvedPaths = new Map<string, string>()
        for (const { source, resolved } of resolutions) {
          if (resolved?.id) {
            resolvedPaths.set(
              source,
              normalizePath(stripQueryString(resolved.id)),
            )
          }
        }

        // Filter imports based on resolved paths
        const importsToTransform = new Map<string, Set<string>>()
        const normalizedSrcDir = srcDirectory
          ? normalizePath(srcDirectory)
          : undefined

        for (const [source, names] of allImports) {
          const resolvedPath = resolvedPaths.get(source)
          if (!resolvedPath) {
            continue
          }

          // Skip non-parseable files (CSS, images, etc.)
          if (!isParseableFile(resolvedPath)) {
            if (debug) {
              console.info(
                '[split-exports] Skipping import (non-parseable file):',
                source,
                '->',
                resolvedPath,
              )
            }
            continue
          }

          // Skip node_modules
          if (resolvedPath.includes('/node_modules/')) {
            continue
          }

          // If srcDirectory is set, only include files inside it
          if (normalizedSrcDir && !resolvedPath.startsWith(normalizedSrcDir)) {
            if (debug) {
              console.info(
                '[split-exports] Skipping import (outside srcDirectory):',
                source,
                '->',
                resolvedPath,
              )
            }
            continue
          }

          // Check if target module exports classes (skip if so to preserve class identity)
          let hasClasses = classExportCache.get(resolvedPath)
          if (hasClasses === undefined) {
            try {
              // In build mode, we need to pass ctx.load for loading modules
              const ctxLoad =
                this.environment.mode === 'build'
                  ? this.load.bind(this)
                  : undefined
              const targetCode = await loaderApi.loadModuleCode(
                this.environment,
                resolvedPath,
                ctxLoad,
              )
              hasClasses = hasClassExports(targetCode)
              classExportCache.set(resolvedPath, hasClasses)
            } catch {
              // If we can't load the module, assume no classes (safe fallback)
              hasClasses = false
              classExportCache.set(resolvedPath, hasClasses)
            }
          }

          if (hasClasses) {
            if (debug) {
              console.info(
                '[split-exports] Skipping import (module exports class):',
                source,
                '->',
                resolvedPath,
              )
            }
            continue
          }

          importsToTransform.set(source, names)
          if (debug) {
            console.info(
              '[split-exports] Including import:',
              source,
              '->',
              resolvedPath,
            )
          }
        }

        if (importsToTransform.size === 0) {
          return null
        }

        const result = transformImports(code, id, {
          importsToTransform,
          ast, // Reuse the AST from extractImportsFromModule
          sourceMaps, // Skip sourcemap generation if disabled in Vite config
        })

        if (result && debug) {
          console.info(
            `[split-exports env: ${this.environment.name}] Rewrote imports in:`,
            id,
          )
          logDiff(code, result.code)
          console.log('Output:\n', result.code + '\n\n')
        }

        return result
      },
    },

    // Invalidate class export cache on HMR
    hotUpdate(ctx) {
      for (const mod of ctx.modules) {
        if (mod.id) {
          classExportCache.delete(mod.id)
        }
      }
    },
  }
}

/**
 * Plugin 2: Resolve split-exports query IDs.
 * When we see an import like './foo?tss-split-exports=bar', we resolve the base path
 * and re-attach our query parameter.
 */
function resolverPlugin(): Plugin {
  return {
    name: 'tanstack-split-exports:resolve',

    resolveId: {
      filter: {
        id: new RegExp(`[?&]${SPLIT_EXPORTS_QUERY_KEY}=`),
      },
      async handler(id, importer, resolveOptions) {
        // Extract our query and the clean path
        const { cleanId, exportNames } = extractSplitExportsQuery(id)

        // Resolve the clean path using Vite's normal resolution
        const resolved = await this.resolve(cleanId, importer, {
          ...resolveOptions,
          skipSelf: true,
        })

        if (!resolved) {
          return null
        }

        // Re-attach our query to the resolved path
        // Check if the resolved ID already has query params
        const hasQuery = resolved.id.includes('?')
        const separator = hasQuery ? '&' : '?'
        // URL-encode individual names to handle $ and unicode characters in identifiers
        const sortedNames = Array.from(exportNames)
          .sort()
          .map(encodeURIComponent)
          .join(',')

        return {
          ...resolved,
          id: `${resolved.id}${separator}${SPLIT_EXPORTS_QUERY_KEY}=${sortedNames}`,
        }
      },
    },
  }
}

/**
 * Plugin 3: Transform modules with split-exports query to only export requested symbols.
 * This runs after other transforms (like TypeScript compilation) have processed the code.
 */
function exportTransformerPlugin(): Plugin {
  let sourceMaps = true

  return {
    name: 'tanstack-split-exports:transform-exports',
    enforce: 'pre',

    configResolved(config) {
      // Capture sourcemap setting from Vite config
      sourceMaps = shouldGenerateSourceMaps(config)
    },

    transform: {
      filter: {
        id: new RegExp(`[?&]${SPLIT_EXPORTS_QUERY_KEY}=`),
      },
      handler(code, id) {
        // Safety check: skip non-parseable files (CSS, images, etc.)
        // This shouldn't happen if importRewriterPlugin is working correctly,
        // but we check here as a safety net
        if (!isParseableFile(id)) {
          return null
        }

        // Skip modules that are being processed by the directive functions plugin
        // (server function extraction). These modules need to preserve their
        // handler exports which may not be in the split-exports list.
        if (hasDirectiveQuery(id)) {
          if (debug) {
            console.info('[split-exports] Skipping (has directive query):', id)
          }
          return null
        }

        const exportsToKeep = parseSplitExportsQuery(id)
        if (!exportsToKeep || exportsToKeep.size === 0) {
          return null
        }

        const cleanId = removeSplitExportsQuery(id)

        if (debug) {
          console.info(
            `[split-exports env: ${this.environment.name}] Transforming exports in:`,
            id,
            'keeping:',
            Array.from(exportsToKeep),
          )
        }

        const result = transformExports(code, cleanId, exportsToKeep, {
          sourceMaps, // Skip sourcemap generation if disabled in Vite config
        })

        if (!result) {
          return null
        }

        if (debug) {
          logDiff(code, result.code)
          console.log('Output:\n', result.code + '\n\n')
        }

        return result
      },
    },
  }
}

/**
 * Plugin 4: Handle HMR invalidation for split-exports modules.
 * When a source file changes, we need to invalidate all the split-exports variants of it.
 */
function hmrPlugin(): Plugin {
  return {
    name: 'tanstack-split-exports:hmr',
    apply: 'serve',

    hotUpdate(ctx) {
      const affectedModules: Set<(typeof ctx.modules)[number]> = new Set()

      for (const mod of ctx.modules) {
        if (!mod.id) continue

        const modIdWithoutQuery = removeSplitExportsQuery(mod.id)

        // Find all modules in the graph that are split-exports variants of this file
        for (const [id, module] of this.environment.moduleGraph.idToModuleMap) {
          if (!hasSplitExportsQuery(id)) {
            continue
          }

          const cleanId = removeSplitExportsQuery(id)

          // Check if this split-exports module is derived from the changed file
          if (cleanId === modIdWithoutQuery || cleanId === mod.id) {
            // Invalidate this split-exports variant
            affectedModules.add(module)

            // Also mark importers for update so they can re-evaluate
            for (const importer of module.importers) {
              affectedModules.add(importer)
            }
          }
        }
      }

      // Add affected modules to the update
      if (affectedModules.size > 0) {
        return [...ctx.modules, ...affectedModules]
      }

      return undefined
    },
  }
}

/**
 * Creates the split-exports Vite plugin.
 *
 * This plugin automatically optimizes imports by:
 * 1. Analyzing which exports are actually imported from each module
 * 2. Rewriting imports to include a query string specifying needed exports
 * 3. Transforming the imported modules to only export what's needed
 * 4. Running dead code elimination to remove unused code
 *
 * This prevents server-only code from leaking into client bundles when
 * a module exports both isomorphic and server-only code.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { splitExportsPlugin } from '@tanstack/start-plugin-core'
 *
 * export default {
 *   plugins: [
 *     splitExportsPlugin({
 *       enabled: true,
 *       debug: false,
 *     }),
 *   ],
 * }
 * ```
 */
export function splitExportsPlugin(
  options: SplitExportsPluginOptions = {},
): PluginOption {
  const { enabled = true } = options

  if (!enabled) {
    return []
  }

  return [
    importRewriterPlugin(options),
    resolverPlugin(),
    exportTransformerPlugin(),
    hmrPlugin(),
  ]
}
