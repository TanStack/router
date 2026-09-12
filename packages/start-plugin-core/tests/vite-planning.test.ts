import { describe, expect, it } from 'vitest'
import {
  createViteConfigPlan,
  createViteResolvedEntryAliases,
} from '../src/vite/planning'

describe('Vite planning', () => {
  it('uses the server entry input for the prerender route options environment', () => {
    const entryAliases = createViteResolvedEntryAliases({
      entryPaths: {
        client: '/app/src/client.tsx',
        server: '/app/src/server.tsx',
        start: '/app/src/start.tsx',
        router: '/app/src/router.tsx',
      },
    })

    const plan = createViteConfigPlan({
      viteConfig: {},
      command: 'build',
      framework: 'react',
      entryAliases,
      clientOutputDirectory: '/app/dist/client',
      serverOutputDirectory: '/app/dist/server',
      serverFnProviderEnv: 'ssr',
      separatePrerenderRouteOptions: true,
      optimizeDepsExclude: [],
      noExternal: [],
    })

    const prerenderEnvironment = plan.environments.prerender

    expect(prerenderEnvironment).toBeDefined()
    expect(prerenderEnvironment!.build.rollupOptions.input).toEqual({
      server: '/app/src/server.tsx',
    })
  })
})
