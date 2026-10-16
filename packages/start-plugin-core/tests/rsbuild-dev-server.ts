/**
 * Rsbuild dev-server harness of the Start compiler: an Rsbuild dev server
 * with the Start compiler's Rsbuild transforms (`client` environment) on a
 * temporary app, through the shared Rsbuild dev-server harness
 * (`@tanstack/compiler-test-utils/rsbuild-dev-server`).
 * `@tanstack/react-start` is the stand-in package of the build harness
 * (`startRuntimeFiles`). With `importProtection`, Start's Rsbuild import
 * protection also runs on the `client` environment. The temporary apps live in
 * this directory.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { onTestFinished } from 'vitest'
import { registerImportProtection } from '../src/rsbuild/import-protection'
import importProtectionLoader from '../src/rsbuild/import-protection-loader'
import { registerStartCompilerTransforms } from '../src/rsbuild/start-compiler-host'
import { startRuntimeFiles } from './build-harness'
import type { ImportProtectionOptions } from '../src/schema'
import type {
  RsbuildDevServer,
  RsbuildDevServerOptions,
} from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * The compiler host registers its metadata loader by the path of its
 * compiled file, which does not exist when the tests run the TypeScript
 * sources. Rspack loads loaders from disk, so the app gets an equivalent
 * JavaScript loader (start-compiler-metadata-loader.ts).
 */
const metadataLoader = `module.exports = function (source, map) {
  const { metadataById } = this.getOptions()
  const setBuildInfo = this['tanstack.start.setServerFnBuildInfo']
  if (setBuildInfo) setBuildInfo(metadataById.get(this.resource) ?? null)
  this.callback(null, source, map)
}
`

/**
 * The import-protection loader is registered by the path of its compiled file
 * too, and shares its state with the plugin through its options; the app gets
 * a JavaScript loader that runs the TypeScript loader the tests import.
 */
const importProtectionLoaderGlobal = '__tanstackStartTestImportProtectionLoader'
;(globalThis as Record<string, unknown>)[importProtectionLoaderGlobal] =
  importProtectionLoader
const delegatingImportProtectionLoader = `module.exports = function (...args) {
  return globalThis.${importProtectionLoaderGlobal}.apply(this, args)
}
`

/** Loaders the app gets in place of the compiled ones, by name. */
const loaderFiles = {
  'start-compiler-metadata-loader': 'start-compiler-metadata-loader.cjs',
  'import-protection-loader': 'import-protection-loader.cjs',
}

/**
 * Starts an Rsbuild dev server with the Start compiler on an app of `files`
 * (entry `src/entry.ts`), and with import protection configured by
 * `importProtection` when given (source directory `src`).
 */
export function startRsbuildDevServer(
  options: Omit<RsbuildDevServerOptions, 'dir' | 'plugins'> & {
    importProtection?: ImportProtectionOptions
  },
): Promise<RsbuildDevServer> {
  const { files, importProtection, ...devServerOptions } = options
  return createRsbuildDevServer({
    dir: harnessDir,
    prefix: '.start-rsbuild-dev-server-',
    registerCleanup: onTestFinished,
    ...devServerOptions,
    config: { environments: { client: {} }, ...devServerOptions.config },
    files: {
      ...startRuntimeFiles,
      'start-compiler-metadata-loader.cjs': metadataLoader,
      'import-protection-loader.cjs': delegatingImportProtectionLoader,
      ...files,
    },
    plugins: ({ root }) => [
      {
        name: 'start-compiler',
        setup(api) {
          registerStartCompilerTransforms(api, {
            framework: 'react',
            root,
            environments: [{ name: 'client', type: 'client' }],
            providerEnvName: 'ssr',
          })
          if (importProtection) {
            registerImportProtection(api, {
              framework: 'react',
              environments: [{ name: 'client', type: 'client' }],
              getConfig: () => ({
                startConfig: { importProtection },
                resolvedStartConfig: {
                  root,
                  srcDirectory: path.join(root, 'src'),
                },
              }),
            })
          }
          api.modifyRspackConfig((config) => {
            for (const rule of config.module?.rules ?? []) {
              const uses = rule && typeof rule === 'object' ? rule.use : null
              for (const use of Array.isArray(uses) ? uses : []) {
                if (!use || typeof use !== 'object') {
                  continue
                }
                for (const [name, file] of Object.entries(loaderFiles)) {
                  if (use.loader?.includes(name)) {
                    use.loader = path.join(root, file)
                  }
                }
              }
            }
          })
        },
      },
    ],
  })
}
