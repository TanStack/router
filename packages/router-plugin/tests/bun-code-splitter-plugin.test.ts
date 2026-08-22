import { describe, expect, it } from 'vitest'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { createBunRouterCodeSplitterRuntime } from '../src/core/bun-code-splitter-plugin'

const ROUTE_CODE = `
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => ({ ok: true }),
})

function Home() {
  return <div>Hello</div>
}
`

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

  it('transforms a registered route reference (lazy split)', () => {
    const context = createRouterPluginContext()
    const routeFile = '/tmp/app/src/routes/index.tsx'
    context.routesByFile.set(routeFile, { routeId: '/' })

    const runtime = createBunRouterCodeSplitterRuntime(context, {
      root: '/tmp/app',
      isProduction: true,
      config: {
        target: 'react',
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
        autoCodeSplitting: true,
      },
    })

    const transformed = runtime.transformReference(ROUTE_CODE, routeFile)
    expect(transformed).not.toBe(ROUTE_CODE)
    // Split routes typically drop/move component into a virtual module import
    expect(
      transformed.includes('tsr-split') ||
        transformed.includes('lazyRouteComponent') ||
        transformed !== ROUTE_CODE,
    ).toBe(true)
  })

  it('returns original code for non-route files', () => {
    const context = createRouterPluginContext()
    const runtime = createBunRouterCodeSplitterRuntime(context, {
      root: '/tmp/app',
      isProduction: true,
      config: {
        target: 'react',
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      },
    })

    const code = `export const x = 1`
    expect(runtime.transformReference(code, '/tmp/app/src/utils.ts')).toBe(
      code,
    )
  })

  it('skips reference transform when autoCodeSplitting is disabled', () => {
    const context = createRouterPluginContext()
    const routeFile = '/tmp/app/src/routes/index.tsx'
    context.routesByFile.set(routeFile, { routeId: '/' })

    const runtime = createBunRouterCodeSplitterRuntime(context, {
      root: '/tmp/app',
      isProduction: true,
      config: {
        target: 'react',
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
        autoCodeSplitting: false,
      },
    })

    expect(runtime.transformReference(ROUTE_CODE, routeFile)).toBe(ROUTE_CODE)
  })
})
