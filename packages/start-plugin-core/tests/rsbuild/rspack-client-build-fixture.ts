import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rspack } from '@rsbuild/core'
import type { Rspack } from '@rsbuild/core'
import type { NormalizedClientBuild } from '../../src/types'

export const FIXTURE_ROOT = fileURLToPath(
  new URL('./fixtures/rspack-client-build/', import.meta.url),
).replace(/[\\/]$/, '')

export type FixtureMode = 'development' | 'production'

export async function compileClientFixture<T>(
  options: { mode: FixtureMode; withRscEntry?: boolean },
  inspect: (compilation: Rspack.Compilation) => T,
): Promise<T> {
  const outputPath = await mkdtemp(join(tmpdir(), 'rspack-client-build-'))
  let compiler: Rspack.Compiler | undefined
  let result: T

  try {
    compiler = rspack({
      mode: options.mode,
      context: FIXTURE_ROOT,
      devtool: false,
      entry: {
        index: './src/index.js',
        ...(options.withRscEntry ? { rsc: './src/rsc.js' } : {}),
      },
      output: {
        path: outputPath,
        filename: '[name].js',
        chunkFilename: '[name].js',
        cssFilename: '[name].css',
        cssChunkFilename: '[name].css',
        assetModuleFilename: 'assets/[name][ext]',
      },
      module: {
        rules: [
          {
            test: /\.css$/,
            // The enclosing package is sideEffects: false, unlike this fixture app.
            sideEffects: true,
            oneOf: [
              { resourceQuery: /url/, type: 'asset/resource' },
              { type: 'css/auto' },
            ],
          },
        ],
      },
      optimization: {
        minimize: false,
        chunkIds: 'named',
        moduleIds: 'named',
        splitChunks: {
          chunks: 'all',
          minSize: 0,
          cacheGroups: {
            vendors: {
              test: /[\\/]shared[\\/]vendor-/,
              name: 'vendors',
              enforce: true,
            },
            bigShared: {
              test: /big-shared/,
              name: 'big-shared',
              enforce: true,
            },
            sharedStyles: {
              test: /shared-styles\.css$/,
              type: 'css/auto',
              name: 'shared-styles',
              enforce: true,
            },
          },
        },
      },
      plugins: [
        {
          apply(fixtureCompiler: Rspack.Compiler) {
            fixtureCompiler.hooks.thisCompilation.tap(
              'InspectClientFixture',
              (compilation: Rspack.Compilation) => {
                compilation.hooks.processAssets.tap(
                  {
                    name: 'InspectClientFixture',
                    stage: rspack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
                  },
                  () => {
                    result = inspect(compilation)
                  },
                )
              },
            )
          },
        },
      ],
    })

    return await new Promise<T>((resolve, reject) => {
      compiler!.run((error, stats) => {
        if (error) {
          reject(error)
        } else if (!stats || stats.hasErrors()) {
          reject(
            new Error(
              stats?.toString({
                all: false,
                errors: true,
                errorDetails: true,
              }) ?? 'Rspack did not return compilation stats',
            ),
          )
        } else {
          resolve(result)
        }
      })
    })
  } finally {
    try {
      if (compiler) {
        await new Promise<void>((resolve, reject) => {
          compiler!.close((error) => {
            if (error) {
              reject(error)
            } else {
              resolve()
            }
          })
        })
      }
    } finally {
      await rm(outputPath, { recursive: true, force: true })
    }
  }
}

export function expectedChunkFileOrder(
  compilation: Rspack.Compilation,
): Array<string> {
  const files: Array<string> = []
  for (const chunk of compilation.chunks) {
    for (const file of chunk.files) {
      if (
        (file.endsWith('.js') || file.endsWith('.mjs')) &&
        !file.includes('.hot-update.')
      ) {
        files.push(file)
      }
    }
  }
  return files
}

export function cssAssetOrder(compilation: Rspack.Compilation): Array<string> {
  return compilation
    .getAssets()
    .filter((asset) => asset.name.endsWith('.css'))
    .map((asset) => asset.name)
}

export function serializeClientBuild(build: NormalizedClientBuild): unknown {
  const fixtureRoot = FIXTURE_ROOT.replace(/\\/g, '/')
  return {
    entryChunkFileName: build.entryChunkFileName,
    // Rspack's chunk and asset iteration order varies between compilations in one process.
    chunksByFileName: Array.from(build.chunksByFileName)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([fileName, chunk]) => [
        fileName,
        {
          ...chunk,
          routeFilePaths: chunk.routeFilePaths.map((filePath) =>
            filePath.replaceAll(fixtureRoot, '<fixture>'),
          ),
        },
      ]),
    cssContentByFileName: build.cssContentByFileName
      ? Array.from(build.cssContentByFileName).sort(([left], [right]) =>
          left.localeCompare(right),
        )
      : undefined,
  }
}

export function fixtureRouteTreeRoutes(): Record<
  string,
  { filePath?: string }
> {
  const routes: Record<string, { filePath?: string }> = { __root__: {} }
  for (const name of ['posts', 'post', 'about', 'settings']) {
    routes[`/${name}`] = {
      filePath: join(FIXTURE_ROOT, 'src/routes', `${name}.js`).replace(
        /\\/g,
        '/',
      ),
    }
  }
  return routes
}
