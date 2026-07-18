import path from 'node:path'
import * as t from '@babel/types'
import { describe, expect, it } from 'vitest'
import { parseAst } from '@tanstack/router-utils'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import type { Config } from '../src/core/config'
import type { UnpluginOptions, TransformResult } from 'unplugin'

const referencePluginName =
  'tanstack-router:code-splitter:compile-reference-file'

function getReferencePlugin(
  plugins: ReturnType<typeof createRouterCodeSplitterPlugin>,
): UnpluginOptions {
  const pluginArray = Array.isArray(plugins) ? plugins : [plugins]
  const plugin = pluginArray.find((item) => item.name === referencePluginName)
  if (!plugin) {
    throw new Error('Reference code-splitter plugin not found')
  }
  return plugin
}

async function configurePlugin(
  plugin: UnpluginOptions,
  pluginNames: Array<string> = [referencePluginName],
) {
  const hook = plugin.vite?.configResolved
  if (!hook) {
    return
  }

  const config = {
    root: process.cwd(),
    plugins: pluginNames.map((name) => ({ name })),
  } as never

  if (typeof hook === 'function') {
    await hook.call({} as never, config)
    return
  }

  await hook.handler.call({} as never, config)
}

async function transformReferenceRoute(
  plugin: UnpluginOptions,
  code: string,
  id: string,
): Promise<TransformResult | null | undefined> {
  const transform = plugin.transform
  if (!transform || typeof transform === 'function') {
    throw new Error('Expected object transform')
  }
  return transform.handler.call({} as never, code, id)
}

function getCode(result: TransformResult | null | undefined) {
  if (!result) {
    return null
  }
  if (typeof result === 'string') {
    return result
  }
  return result.code
}

function countProgramHotDeclarations(code: string) {
  const ast = parseAst({ code })
  return ast.program.body.filter((statement) => {
    return (
      t.isVariableDeclaration(statement) &&
      statement.declarations.some((declaration) => {
        return t.isIdentifier(declaration.id) && declaration.id.name === 'hot'
      })
    )
  }).length
}

describe('router plugin context', () => {
  it.each([
    ['react', 'vite:react-babel'],
    ['solid', 'solid'],
  ] as const)(
    'keeps the router before the %s source transform',
    async (target, frameworkPluginName) => {
      const context = createRouterPluginContext()
      const splitter = getReferencePlugin(
        createRouterCodeSplitterPlugin({ target }, context),
      )

      await expect(
        configurePlugin(splitter, [frameworkPluginName, referencePluginName]),
      ).rejects.toThrow("is placed before '@tanstack/router-plugin'")
      await expect(
        configurePlugin(splitter, [referencePluginName, frameworkPluginName]),
      ).resolves.toBeUndefined()
    },
  )

  it('requires the Octane compiler to lower TSRX before route analysis', async () => {
    const context = createRouterPluginContext()
    const splitter = getReferencePlugin(
      createRouterCodeSplitterPlugin({ target: 'octane' }, context),
    )

    await expect(configurePlugin(splitter)).rejects.toThrow(
      "'octane/compiler/vite' is required for the 'octane' target",
    )
    await expect(
      configurePlugin(splitter, [referencePluginName, 'octane']),
    ).rejects.toThrow(
      "'octane/compiler/vite' is placed after '@tanstack/router-plugin'",
    )
  })

  it('accepts the Octane compiler before route analysis', async () => {
    const context = createRouterPluginContext()
    const splitter = getReferencePlugin(
      createRouterCodeSplitterPlugin({ target: 'octane' }, context),
    )

    await expect(
      configurePlugin(splitter, ['octane', referencePluginName]),
    ).resolves.toBeUndefined()
  })

  it('requires the Octane compiler when code splitting is disabled', async () => {
    const context = createRouterPluginContext()
    const hmrPlugin = createRouterHmrPlugin({ target: 'octane' }, context)
    const hmr = Array.isArray(hmrPlugin) ? hmrPlugin[0]! : hmrPlugin

    await expect(configurePlugin(hmr, ['tanstack-router:hmr'])).rejects.toThrow(
      "'octane/compiler/vite' is required for the 'octane' target",
    )
    await expect(
      configurePlugin(hmr, ['tanstack-router:hmr', 'octane']),
    ).rejects.toThrow(
      "'octane/compiler/vite' is placed after '@tanstack/router-plugin'",
    )
    await expect(
      configurePlugin(hmr, ['octane', 'tanstack-router:hmr']),
    ).resolves.toBeUndefined()
  })

  it('keeps multiple code-splitter instances isolated by explicit context', async () => {
    const routeFile = normalizePath(
      path.join(process.cwd(), 'src/routes-a/owned.tsx'),
    )
    const otherRouteFile = normalizePath(
      path.join(process.cwd(), 'src/routes-b/other.tsx'),
    )

    const routeCode = `
import { createFileRoute } from '@tanstack/react-router'

function Component() {
  return <div>Hello</div>
}

export const Route = createFileRoute('/owned')({
  component: Component,
})
`

    const contextA = createRouterPluginContext()
    contextA.routesByFile.set(routeFile, { routeId: '/owned' })

    const contextB = createRouterPluginContext()
    contextB.routesByFile.set(otherRouteFile, { routeId: '/other' })

    const configA = {
      target: 'react',
      routesDirectory: './src/routes-a',
      generatedRouteTree: './src/routeTree-a.gen.ts',
      autoCodeSplitting: true,
    } satisfies Partial<Config>

    const configB = {
      target: 'react',
      routesDirectory: './src/routes-b',
      generatedRouteTree: './src/routeTree-b.gen.ts',
      autoCodeSplitting: true,
    } satisfies Partial<Config>

    const splitterA = getReferencePlugin(
      createRouterCodeSplitterPlugin(configA, contextA),
    )
    const splitterB = getReferencePlugin(
      createRouterCodeSplitterPlugin(configB, contextB),
    )

    await configurePlugin(splitterA)
    await configurePlugin(splitterB)

    const firstResult = await transformReferenceRoute(
      splitterA,
      routeCode,
      routeFile,
    )
    const firstCode = getCode(firstResult)

    expect(firstCode).not.toBeNull()
    expect(countProgramHotDeclarations(firstCode!)).toBe(1)

    const secondResult = await transformReferenceRoute(
      splitterB,
      firstCode!,
      routeFile,
    )

    expect(secondResult).toBeNull()
  })

  it('normalizes HMR options before the first transform', async () => {
    const routeFile = normalizePath(
      path.join(process.cwd(), 'src/routes/owned.tsx'),
    )

    const routeCode = `
import { createFileRoute } from '@tanstack/react-router'

function Component() {
  return <div>Hello</div>
}

export const Route = createFileRoute('/owned')({
  component: Component,
})
`

    const context = createRouterPluginContext()
    context.routesByFile.set(routeFile, { routeId: '/owned' })

    const hmrPlugin = createRouterHmrPlugin({}, context)
    const hmrResult = await transformReferenceRoute(
      Array.isArray(hmrPlugin) ? hmrPlugin[0]! : hmrPlugin,
      routeCode,
      routeFile,
    )

    const hmrCode = getCode(hmrResult)

    expect(hmrCode).not.toBeNull()
    expect(hmrCode).toContain('TSRFastRefreshAnchor')
  })

  it('adds Octane HMR handling to compiled .tsrx routes', async () => {
    const routeFile = normalizePath(
      path.join(process.cwd(), 'src/routes/owned.tsrx'),
    )
    const routeCode = `
import { createFileRoute } from '@tanstack/octane-router'

function Component() {}

export const Route = createFileRoute('/owned')({
  component: Component,
})
`
    const context = createRouterPluginContext()
    context.routesByFile.set(routeFile, { routeId: '/owned' })
    const hmrPlugin = createRouterHmrPlugin({ target: 'octane' }, context)
    const hmrResult = await transformReferenceRoute(
      Array.isArray(hmrPlugin) ? hmrPlugin[0]! : hmrPlugin,
      routeCode,
      routeFile,
    )
    const hmrCode = getCode(hmrResult)

    expect(hmrCode).not.toBeNull()
    expect(hmrCode).toContain('hot.accept')
    expect(hmrCode).toContain("from '@tanstack/octane-router'")
  })
})
