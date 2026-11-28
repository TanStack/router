/**
 * Perf guards of the router plugin: resource checks through the documented
 * stats knob (`TSR_COMPILER_STATS=1`, which keeps nothing alive itself), not
 * behaviour. A finished one-shot build (`compiler.run()`, then
 * `compiler.close()`, as the webpack and Rspack CLIs do) leaves nothing of
 * the router plugin's compiler session alive: its route listener ends with
 * the compiler. The generator and the code splitter as separate plugins
 * share the module's default context, which outlives every build.
 */
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { compilerStats } from '@tanstack/router-utils/compiler'
import {
  TanStackRouterCodeSplitterRspack,
  TanStackRouterGeneratorRspack,
} from '../../../src/rspack'
import {
  TanStackRouterCodeSplitterWebpack,
  TanStackRouterGeneratorWebpack,
} from '../../../src/webpack'
import { build, routeApp } from '../../build-harness'
import type { RouterPluginOptions } from '../../../src/hosts/vite'

const route = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => 'MARK_PAGE' })
`

const separatePlugins = {
  webpack: (config: RouterPluginOptions) => [
    TanStackRouterGeneratorWebpack(config as never),
    TanStackRouterCodeSplitterWebpack(config as never),
  ],
  rspack: (config: RouterPluginOptions) => [
    TanStackRouterGeneratorRspack(config as never),
    TanStackRouterCodeSplitterRspack(config as never),
  ],
}

describe.each(['webpack', 'rspack'] as const)('%s', (bundler) => {
  test('finished builds leave fewer router compiler sessions alive than they created', async () => {
    vi.stubEnv('TSR_COMPILER_STATS', '1')
    onTestFinished(() => {
      vi.unstubAllEnvs()
    })
    const builds = 3
    const label = `router-plugin:${bundler}:session`
    /** The sessions the stats knob reports alive while each build's compiler is: a positive control. */
    const whileBuilding: Array<number> = []
    for (let n = 0; n < builds; n++) {
      const app = await build({
        bundler,
        env: 'client',
        files: routeApp(route, { env: 'client' }),
        routerPlugins: (config) => [
          ...separatePlugins[bundler](config),
          {
            apply(compiler: {
              hooks: { done: { tap: (name: string, fn: () => void) => void } }
            }) {
              compiler.hooks.done.tap('test:sessions', () => {
                whileBuilding.push(compilerStats()[label]?.instances ?? 0)
              })
            },
          },
        ],
      })
      expect(app.where('MARK_PAGE')).not.toBe('nowhere')
    }
    // (a missing label must not read as released: the knob saw them live)
    expect(whileBuilding, "live sessions at each build's end").toHaveLength(
      builds,
    )
    expect(Math.min(...whileBuilding)).toBeGreaterThan(0)
    setFlagsFromString('--expose-gc')
    const gc = runInNewContext('gc') as () => void
    for (let round = 0; round < 5; round++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      gc()
    }
    // (released sessions leave the registry: no label is none alive)
    expect(compilerStats()[label]?.instances ?? 0).toBeLessThan(builds)
  })
})
