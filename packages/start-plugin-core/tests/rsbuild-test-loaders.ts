/**
 * Start's Rsbuild integration registers its loaders by the path of their
 * compiled files, which do not exist when the tests run the TypeScript
 * sources, and Rspack loads loaders from disk. The test apps get equivalent
 * JavaScript loaders (`testLoaderFiles`), and `useTestLoaders` points the
 * Rspack rules at them.
 */
import path from 'node:path'
import importProtectionLoader from '../src/rsbuild/import-protection-loader'
import type { RsbuildPlugin } from '@rsbuild/core'

/** Same as start-compiler-metadata-loader.ts. */
const metadataLoader = `module.exports = function (source, map) {
  const { metadataById } = this.getOptions()
  const setBuildInfo = this['tanstack.start.setServerFnBuildInfo']
  if (setBuildInfo) setBuildInfo(metadataById.get(this.resource) ?? null)
  this.callback(null, source, map)
}
`

/**
 * The import-protection loader shares its state with the plugin through its
 * options; the app's loader runs the TypeScript loader the tests import.
 */
const importProtectionLoaderGlobal = '__tanstackStartTestImportProtectionLoader'
;(globalThis as Record<string, unknown>)[importProtectionLoaderGlobal] =
  importProtectionLoader
const delegatingImportProtectionLoader = `module.exports = function (...args) {
  return globalThis.${importProtectionLoaderGlobal}.apply(this, args)
}
`

/** Loader file of the app in place of each compiled loader, by name. */
const loaderFileNames = {
  'start-compiler-metadata-loader': 'start-compiler-metadata-loader.cjs',
  'import-protection-loader': 'import-protection-loader.cjs',
}

/** The loader files an app needs (`useTestLoaders` points the rules at them). */
export const testLoaderFiles: Record<string, string> = {
  [loaderFileNames['start-compiler-metadata-loader']]: metadataLoader,
  [loaderFileNames['import-protection-loader']]:
    delegatingImportProtectionLoader,
}

/**
 * Points the Rspack rules Start registered (in plugins before this one) at
 * the loader files of the app at `root`.
 */
export function useTestLoaders(root: string): RsbuildPlugin {
  return {
    name: 'start-test-loaders',
    setup(api) {
      api.modifyRspackConfig({
        order: 'post',
        handler: (config) => {
          for (const rule of config.module.rules ?? []) {
            const uses = rule && typeof rule === 'object' ? rule.use : null
            for (const use of Array.isArray(uses) ? uses : []) {
              if (!use || typeof use !== 'object') {
                continue
              }
              for (const [name, file] of Object.entries(loaderFileNames)) {
                if (use.loader.includes(name)) {
                  use.loader = path.join(root, file)
                }
              }
            }
          }
        },
      })
    },
  }
}
