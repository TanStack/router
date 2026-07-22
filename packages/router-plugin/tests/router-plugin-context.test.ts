import path from 'node:path'
import * as t from '@babel/types'
import { describe, expect, it, vi } from 'vitest'
import { parseAst } from '@tanstack/router-utils'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { unpluginRouterComposedFactory } from '../src/core/router-composed-plugin'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import type { Config } from '../src/core/config'
import type { UnpluginOptions, TransformResult } from 'unplugin'

const referencePluginName =
  'tanstack-router:code-splitter:compile-reference-file'
const virtualPluginName = 'tanstack-router:code-splitter:compile-virtual-file'

function getCodeSplitterPlugin(
  plugins: ReturnType<typeof createRouterCodeSplitterPlugin>,
  pluginName: string,
): UnpluginOptions {
  const pluginArray = Array.isArray(plugins) ? plugins : [plugins]
  const plugin = pluginArray.find((item) => item.name === pluginName)
  if (!plugin) {
    throw new Error(`Code-splitter plugin "${pluginName}" not found`)
  }
  return plugin
}

function getReferencePlugin(
  plugins: ReturnType<typeof createRouterCodeSplitterPlugin>,
) {
  return getCodeSplitterPlugin(plugins, referencePluginName)
}

async function configurePlugin(
  plugin: UnpluginOptions,
  options: {
    command?: 'serve' | 'build'
    pluginNames?: Array<string>
  } = {},
) {
  const hook = plugin.vite?.configResolved
  if (!hook) {
    return
  }

  const config = {
    root: process.cwd(),
    command: options.command ?? 'serve',
    plugins: (options.pluginNames ?? [referencePluginName]).map((name) => ({
      name,
    })),
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
        configurePlugin(splitter, {
          pluginNames: [frameworkPluginName, referencePluginName],
        }),
      ).rejects.toThrow("is placed before '@tanstack/router-plugin'")
      await expect(
        configurePlugin(splitter, {
          pluginNames: [referencePluginName, frameworkPluginName],
        }),
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
      configurePlugin(splitter, {
        pluginNames: [referencePluginName, 'octane'],
      }),
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
      configurePlugin(splitter, {
        pluginNames: ['octane', referencePluginName],
      }),
    ).resolves.toBeUndefined()
  })

  it('requires the Octane compiler when code splitting is disabled', async () => {
    const context = createRouterPluginContext()
    const hmrPlugin = createRouterHmrPlugin({ target: 'octane' }, context)
    const hmr = Array.isArray(hmrPlugin) ? hmrPlugin[0]! : hmrPlugin

    await expect(
      configurePlugin(hmr, { pluginNames: ['tanstack-router:hmr'] }),
    ).rejects.toThrow(
      "'octane/compiler/vite' is required for the 'octane' target",
    )
    await expect(
      configurePlugin(hmr, {
        pluginNames: ['tanstack-router:hmr', 'octane'],
      }),
    ).rejects.toThrow(
      "'octane/compiler/vite' is placed after '@tanstack/router-plugin'",
    )
    await expect(
      configurePlugin(hmr, {
        pluginNames: ['octane', 'tanstack-router:hmr'],
      }),
    ).resolves.toBeUndefined()
  })

  it.each([
    { mode: 'production', production: true },
    { mode: 'development with addHmr disabled', production: false },
  ])(
    'does not run React HMR compiler plugins in $mode',
    async ({ production }) => {
      const routeFile = normalizePath(
        path.join(process.cwd(), 'src/routes/lowercase.tsx'),
      )
      const routeCode = `
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/lowercase')({ component })

function component() {
  return <div>Hello</div>
}
`

      const context = createRouterPluginContext()
      context.routesByFile.set(routeFile, { routeId: '/lowercase' })

      if (production) {
        vi.stubEnv('NODE_ENV', 'production')
      }

      try {
        const plugins = createRouterCodeSplitterPlugin(
          {
            target: 'react',
            autoCodeSplitting: true,
            codeSplittingOptions: production ? undefined : { addHmr: false },
          },
          context,
        )
        const referencePlugin = getReferencePlugin(plugins)
        const virtualPlugin = getCodeSplitterPlugin(plugins, virtualPluginName)

        await configurePlugin(referencePlugin, {
          command: production ? 'build' : 'serve',
        })

        const referenceCode = getCode(
          await transformReferenceRoute(referencePlugin, routeCode, routeFile),
        )
        const virtualCode = getCode(
          await transformReferenceRoute(
            virtualPlugin,
            routeCode,
            `${routeFile}?tsr-split=component`,
          ),
        )

        expect(referenceCode).not.toContain('TSRFastRefreshAnchor')
        expect(virtualCode).toContain('function component()')
        expect(virtualCode).toContain('export { component }')
        expect(virtualCode).not.toContain('SplitComponent')
      } finally {
        if (production) {
          vi.unstubAllEnvs()
        }
      }
    },
  )

  it('keeps Octane compiler metadata in production split modules without HMR', async () => {
    const routeFile = normalizePath(
      path.join(process.cwd(), 'src/routes/octane.tsrx'),
    )
    const routeCode = `
import { createFileRoute } from '@tanstack/octane-router'

function Component() {}
Component.$$singleRoot = true

export const Route = createFileRoute('/octane')({ component: Component })
`

    const context = createRouterPluginContext()
    context.routesByFile.set(routeFile, { routeId: '/octane' })
    const plugins = createRouterCodeSplitterPlugin(
      { target: 'octane', autoCodeSplitting: true },
      context,
    )
    const referencePlugin = getReferencePlugin(plugins)
    const virtualPlugin = getCodeSplitterPlugin(plugins, virtualPluginName)

    await configurePlugin(referencePlugin, {
      command: 'build',
      pluginNames: ['octane', referencePluginName],
    })

    const referenceCode = getCode(
      await transformReferenceRoute(referencePlugin, routeCode, routeFile),
    )
    const virtualCode = getCode(
      await transformReferenceRoute(
        virtualPlugin,
        routeCode,
        `${routeFile}?tsr-split=component`,
      ),
    )

    expect(referenceCode).not.toContain('Component.$$singleRoot')
    expect(virtualCode).toContain('Component.$$singleRoot = true')
    expect(virtualCode).not.toContain('import.meta.hot')
    expect(virtualCode).not.toContain('TSROctaneHmr')
  })

  it('does not install the standalone route HMR plugin in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    try {
      const plugins = unpluginRouterComposedFactory(
        { target: 'react', autoCodeSplitting: false },
        { framework: 'vite' },
      )

      const pluginArray = Array.isArray(plugins) ? plugins : [plugins]
      expect(
        pluginArray.some((plugin) => plugin.name === 'tanstack-router:hmr'),
      ).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
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
