import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { rspack } from '@rsbuild/core'
import { join } from 'pathe'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { normalizeRspackClientBuild } from '../../src/rsbuild/normalized-client-build'
import type { Rspack } from '@rsbuild/core'

describe.each(
  [8, 128].flatMap((routes) =>
    [false, true].flatMap((concatenateModules) =>
      ['route-only', 'mixed'].map((metadata) => ({
        routes,
        concatenateModules,
        metadata,
      })),
    ),
  ),
)(
  'normalize $routes routes, concatenateModules=$concatenateModules, metadata=$metadata',
  ({ routes, concatenateModules, metadata }) => {
    let directory: string
    let compiler: Rspack.Compiler | undefined
    let compilation: Rspack.Compilation

    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), 'tss-normalize-bench-'))
      const files: Record<string, string> = {
        'index.js': `globalThis.routes = [${Array.from(
          { length: routes },
          (_, route) =>
            `() => import('./route-${route}.js?tsr-split=component${metadata === 'mixed' ? `&tss-hydrate=route-${route}` : ''}')`,
        ).join(',')}];`,
        'shared.css': '.shared { display: grid; }',
      }
      for (let route = 0; route < routes; route++) {
        files[`route-${route}.js`] = `${Array.from(
          { length: 12 },
          (_, leaf) =>
            `import { value${leaf} } from './leaf-${route}-${leaf}.js${metadata === 'mixed' ? (leaf % 3 === 0 ? `?tss-hydrate=leaf-${route}` : leaf % 3 === 1 ? '?not-tsr-split=component&not-tss-hydrate=ignored' : '') : ''}';`,
        ).join('\n')}
        import './shared.css';
        import './route-${route}.css';
        export const render = () => [${Array.from({ length: 12 }, (_, leaf) => `value${leaf}()`).join(',')}];`
        files[`route-${route}.css`] = `.route-${route} { color: red; }`
        for (let leaf = 0; leaf < 12; leaf++) {
          files[`leaf-${route}-${leaf}.js`] =
            `export const value${leaf} = () => globalThis['value-${route}-${leaf}'];`
        }
      }
      compiler = rspack({
        context: directory,
        mode: 'production',
        cache: false,
        devtool: false,
        entry: { index: './index.js' },
        output: {
          path: join(directory, 'dist'),
          filename: '[name].js',
          chunkFilename: '[id].js',
          cssFilename: '[name].css',
          cssChunkFilename: '[id].css',
        },
        module: { rules: [{ test: /\.css$/, type: 'css' }] },
        optimization: {
          minimize: false,
          concatenateModules,
          splitChunks: {
            minSize: 0,
            cacheGroups: {
              default: false,
              defaultVendors: false,
              shared: {
                test: /shared\.css$/,
                name: 'shared',
                chunks: 'async',
                enforce: true,
              },
            },
          },
        },
        plugins: [
          new rspack.experiments.VirtualModulesPlugin(
            Object.fromEntries(
              Object.entries(files).map(([file, source]) => [
                join(directory, file),
                source,
              ]),
            ),
          ),
        ],
      })
      const stats = await promisify(compiler.run.bind(compiler))()
      expect(stats?.hasErrors()).toBe(false)
      compilation = stats!.compilation
      const modules = new Set(
        [...compilation.chunks].flatMap((chunk) =>
          compilation.chunkGraph.getChunkModules(chunk),
        ),
      )
      let hasConcatenatedModules = false
      for (const module of modules) {
        const innerModules = (
          module as Rspack.Module & { modules?: Array<Rspack.Module> }
        ).modules
        if (innerModules?.length) {
          hasConcatenatedModules = true
          for (const innerModule of innerModules) {
            modules.add(innerModule)
          }
        }
      }
      expect(hasConcatenatedModules).toBe(concatenateModules)
      expect(
        [...modules].filter((module) =>
          module.nameForCondition()?.includes('/leaf-'),
        ),
      ).toHaveLength(routes * 12)
      const result = normalizeRspackClientBuild(compilation, true)
      expect(result.chunksByFileName.size).toBe(routes + 1)
      expect(
        [...result.chunksByFileName.values()].flatMap(
          (chunk) => chunk.routeFilePaths,
        ),
      ).toHaveLength(routes)
      expect(result.cssContentByFileName?.size).toBe(routes + 1)
      for (const chunk of result.chunksByFileName.values()) {
        if (chunk.isEntry) {
          expect(chunk.dynamicImports).toHaveLength(routes)
          continue
        }
        expect(chunk.css).toHaveLength(2)
        expect(result.cssContentByFileName?.get(chunk.css[0]!)).toMatch(
          /display:\s*grid/,
        )
        expect(result.cssContentByFileName?.get(chunk.css[1]!)).toContain(
          '.route-',
        )
        if (metadata === 'mixed') {
          expect(chunk.hydrationIds).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/^route-\d+$/),
              expect.stringMatching(/^leaf-\d+$/),
            ]),
          )
          expect(chunk.hydrationIds).not.toContain('ignored')
        } else {
          expect(chunk.hydrationIds).toEqual([])
        }
      }
    })

    afterAll(async () => {
      try {
        if (compiler) {
          await promisify(compiler.close.bind(compiler))()
        }
      } finally {
        if (directory) {
          await rm(directory, { recursive: true, force: true })
        }
      }
    })

    for (const inlineCss of [false, true]) {
      test(`normalize compilation, inlineCss=${inlineCss}`, async ({
        bench,
      }) => {
        await bench('normalize compilation', () => {
          normalizeRspackClientBuild(compilation, inlineCss)
        }).run({ time: 3000, warmupIterations: 100 })
      })
    }
  },
)
