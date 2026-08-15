import { describe, expect, it } from 'vitest'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { createBunRouterCodeSplitterRuntime } from '../src/core/bun-code-splitter-plugin'

describe('createBunRouterCodeSplitterRuntime', () => {
  it('returns a named Bun plugin with setup and reference transform', () => {
    const context = createRouterPluginContext()
    context.routesByFile.set('/tmp/routes/index.tsx', { routeId: '/' })

    const runtime = createBunRouterCodeSplitterRuntime(context, {
      root: '/tmp',
      isProduction: true,
      config: {
        target: 'react',
        routesDirectory: './routes',
        generatedRouteTree: './routeTree.gen.ts',
      },
    })

    expect(runtime.plugin.name).toBe('tanstack-router:code-splitter:bun')
    expect(typeof runtime.plugin.setup).toBe('function')
    expect(typeof runtime.transformReference).toBe('function')
  })
})
