import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { rspack } from '@rsbuild/core'
import { join } from 'pathe'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import {
  normalizeRspackClientBuild,
  registerClientBuildCapture,
} from '../../src/rsbuild/normalized-client-build'
import { buildStartManifest } from '../../src/start-manifest-plugin/manifestBuilder'
import type {
  ModifyRspackConfigFn,
  RsbuildPluginAPI,
  Rspack,
} from '@rsbuild/core'
import type { GetConfigFn, NormalizedClientBuild } from '../../src/types'

const routes = 128
const leaves = 12

describe('development client build after a code-only rebuild', () => {
  let directory: string
  let watching: Rspack.Watching | undefined
  let compilation: Rspack.Compilation
  let compiler: Rspack.Compiler
  const routeTreeRoutes: Parameters<
    typeof buildStartManifest
  >[0]['routeTreeRoutes'] = {
    __root__: {
      children: Array.from({ length: routes }, (_, route) => `/r${route}`),
    },
  }

  const createCapture = () => {
    const processAssets = vi.fn<RsbuildPluginAPI['processAssets']>()
    const modifyRspackConfig = vi.fn<(handler: ModifyRspackConfigFn) => void>()
    const { getClientBuild } = registerClientBuildCapture(
      {
        context: { action: 'dev' },
        processAssets,
        modifyRspackConfig,
      } as unknown as RsbuildPluginAPI,
      (() => ({})) as unknown as GetConfigFn,
    )
    const config = { plugins: [] as Array<Rspack.RspackPluginInstance> }
    void modifyRspackConfig.mock.calls[0]![0](
      config as never,
      { environment: { name: 'client' } } as never,
    )
    let startCompilation: () => void = () => {}
    config.plugins[0]!.apply({
      hooks: {
        thisCompilation: {
          tap: (_name: string, fn: () => void) => {
            startCompilation = fn
          },
        },
      },
    } as never)
    const [, capture] = processAssets.mock.calls[0]!
    return {
      capture: () => {
        startCompilation()
        capture({ compilation, compiler } as Parameters<typeof capture>[0])
        return getClientBuild()!
      },
    }
  }

  const buildManifest = (clientBuild: NormalizedClientBuild) =>
    buildStartManifest({ clientBuild, routeTreeRoutes, basePath: '/' })

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tss-dev-reuse-bench-'))
    await writeFile(
      join(directory, 'index.js'),
      `globalThis.routes = [${Array.from(
        { length: routes },
        (_, route) => `() => import('./route-${route}.js?tsr-split=component')`,
      ).join(',')}]`,
    )
    await writeFile(join(directory, 'shared.css'), '.shared { display: grid; }')
    for (let route = 0; route < routes; route++) {
      routeTreeRoutes[`/r${route}`] = {
        filePath: join(directory, `route-${route}.js`),
      }
      await writeFile(join(directory, `route-${route}.css`), `.r${route} {}`)
      await writeFile(
        join(directory, `route-${route}.js`),
        `import './shared.css'\nimport './route-${route}.css'\n${Array.from(
          { length: leaves },
          (_, leaf) =>
            `import { value${leaf} } from './leaf-${route}-${leaf}.js${leaf % 3 === 0 ? `?tss-hydrate=leaf-${route}` : ''}'`,
        ).join('\n')}\nexport const render = () => [${Array.from(
          { length: leaves },
          (_, leaf) => `value${leaf}()`,
        ).join(',')}]`,
      )
      for (let leaf = 0; leaf < leaves; leaf++) {
        await writeFile(
          join(directory, `leaf-${route}-${leaf}.js`),
          `export const value${leaf} = () => ${leaf}`,
        )
      }
    }

    compiler = rspack({
      context: directory,
      mode: 'development',
      devtool: false,
      entry: { index: './index.js' },
      output: { path: join(directory, 'dist') },
      module: { rules: [{ test: /\.css$/, type: 'css' }] },
      plugins: [
        {
          apply(compiler: Rspack.Compiler) {
            compiler.hooks.thisCompilation.tap('Keep', (current) => {
              compilation = current
            })
          },
        },
      ],
    })
    let builds = 0
    let onBuilt: () => void = () => {}
    const built = () =>
      new Promise<void>((resolve) => {
        onBuilt = resolve
      })
    const initial = built()
    watching = compiler.watch({ aggregateTimeout: 50 }, (error, stats) => {
      expect(error).toBeNull()
      expect(stats?.hasErrors()).toBe(false)
      builds++
      onBuilt()
    })
    await initial
    const rebuilt = built()
    await writeFile(
      join(directory, 'leaf-7-1.js'),
      `export const value1 = () => 2`,
    )
    await rebuilt
    expect(builds).toBe(2)
    expect(compilation.builtModules.size).toBeLessThan(
      compilation.modules.size / 100,
    )

    const fresh = normalizeRspackClientBuild(compilation)
    expect(fresh.chunksByFileName.size).toBe(routes + 1)
    const { capture } = createCapture()
    const first = capture()
    expect(first).toEqual(fresh)
    expect(capture()).toBe(first)
    expect(Object.keys(buildManifest(first).routes)).toHaveLength(routes + 1)
  })

  afterAll(async () => {
    if (watching) {
      await new Promise<void>((resolve) => watching!.close(() => resolve()))
    }
    if (directory) {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('normalize and build the manifest on every rebuild (before)', async ({
    bench,
  }) => {
    await bench('normalize + manifest', () => {
      buildManifest(normalizeRspackClientBuild(compilation))
    }).run({ time: 3000, warmupIterations: 50 })
  })

  test('capture the first development compilation, then build the manifest', async ({
    bench,
  }) => {
    await bench('first capture + manifest', () => {
      buildManifest(createCapture().capture())
    }).run({ time: 3000, warmupIterations: 50 })
  })

  test('capture after a code-only rebuild, reusing the manifest', async ({
    bench,
  }) => {
    const { capture } = createCapture()
    capture()
    await bench('capture with reuse', () => {
      capture()
    }).run({ time: 3000, warmupIterations: 50 })
  })
})
