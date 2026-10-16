/**
 * Rsbuild dev-server harness of the Start compiler: an Rsbuild dev server
 * with the Start compiler's Rsbuild transforms (`client` environment) on a
 * temporary app, through the shared Rsbuild dev-server harness
 * (`@tanstack/compiler-test-utils/rsbuild-dev-server`).
 * `@tanstack/react-start` is the stand-in package of the build harness
 * (`startRuntimeFiles`). The temporary apps live in this directory.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { registerStartCompilerTransforms } from '../src/rsbuild/start-compiler-host'
import { startRuntimeFiles } from './build-harness'
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
 * Starts an Rsbuild dev server with the Start compiler on an app of `files`
 * (entry `src/entry.ts`).
 */
export function startRsbuildDevServer(
  options: Omit<RsbuildDevServerOptions, 'dir' | 'plugins'>,
): Promise<RsbuildDevServer> {
  const { files, ...devServerOptions } = options
  return createRsbuildDevServer({
    dir: harnessDir,
    prefix: '.start-rsbuild-dev-server-',
    ...devServerOptions,
    config: { environments: { client: {} }, ...devServerOptions.config },
    files: {
      ...startRuntimeFiles,
      'start-compiler-metadata-loader.cjs': metadataLoader,
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
          api.modifyRspackConfig((config) => {
            for (const rule of config.module?.rules ?? []) {
              const uses = rule && typeof rule === 'object' ? rule.use : null
              for (const use of Array.isArray(uses) ? uses : []) {
                if (
                  use &&
                  typeof use === 'object' &&
                  use.loader?.includes('start-compiler-metadata-loader')
                ) {
                  use.loader = path.join(
                    root,
                    'start-compiler-metadata-loader.cjs',
                  )
                }
              }
            }
          })
        },
      },
    ],
  })
}
