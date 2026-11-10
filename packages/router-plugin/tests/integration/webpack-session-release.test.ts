/**
 * A finished one-shot build (`compiler.run()`, then `compiler.close()`, as
 * the webpack and Rspack CLIs do) leaves nothing of the router plugin's
 * compiler session alive: its route listener ends with the compiler. The
 * generator and the code splitter as separate plugins share the module's
 * default context, which outlives every build. Measured through the
 * documented stats knob (TSR_COMPILER_STATS=1), which keeps nothing alive
 * itself.
 */
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { compilerStats } from '@tanstack/router-utils/compiler'
import {
  TanStackRouterCodeSplitterRspack,
  TanStackRouterGeneratorRspack,
} from '../../src/rspack'
import {
  TanStackRouterCodeSplitterWebpack,
  TanStackRouterGeneratorWebpack,
} from '../../src/webpack'
import { build, routeApp } from '../build-harness'
import type { RouterPluginOptions } from '../../src/hosts/vite'

const timeout = 60_000

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
  test(
    'a finished build leaves no router compiler session alive',
    async () => {
      vi.stubEnv('TSR_COMPILER_STATS', '1')
      onTestFinished(() => {
        vi.unstubAllEnvs()
      })
      const builds = 3
      for (let n = 0; n < builds; n++) {
        const app = await build({
          bundler,
          env: 'client',
          files: routeApp(route, { env: 'client' }),
          routerPlugins: separatePlugins[bundler],
        })
        expect(app.where('MARK_PAGE')).not.toBe('nowhere')
      }
      setFlagsFromString('--expose-gc')
      const gc = runInNewContext('gc') as () => void
      for (let round = 0; round < 5; round++) {
        await new Promise((resolve) => setTimeout(resolve, 10))
        gc()
      }
      expect(
        compilerStats()[`router-plugin:${bundler}:session`]?.instances ?? 0,
      ).toBeLessThan(builds)
    },
    timeout,
  )
})
