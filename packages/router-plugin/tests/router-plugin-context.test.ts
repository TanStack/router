import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import {
  createRouteLoader,
  evaluateModule,
  expectRegisteredRouteOption,
  loadRoute,
} from './regression-helpers'
import type { Config } from '../src/core/config'
import type { CodeSplitGroupings } from '../src/core/constants'
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
  command: 'serve' | 'build' = 'serve',
) {
  const hook = plugin.vite?.configResolved
  if (!hook) {
    return
  }

  const config = {
    root: process.cwd(),
    command,
    plugins: [{ name: referencePluginName }],
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

describe('router plugin context', () => {
  it('splits parenthesized route factories, option values, and grouping arrays', async () => {
    const routeFile = normalizePath(
      path.join(process.cwd(), 'src/routes/wrapped.tsx'),
    )
    const context = createRouterPluginContext()
    context.routesByFile.set(routeFile, { routeId: '/wrapped' })
    const plugins = createRouterCodeSplitterPlugin(
      {
        target: 'react',
        autoCodeSplitting: true,
        codeSplittingOptions: { addHmr: false },
      },
      context,
    )
    await configurePlugin(getReferencePlugin(plugins), 'build')
    const code = `import { createFileRoute } from '@tanstack/react-router'
const Component = () => 'wrapped component'
const loader = () => 'wrapped loader'
export const Route = (createFileRoute('/wrapped'))({
  component: (Component), loader: (loader),
  codeSplitGroupings: (([(['component']), (['loader'])])),
})`
    const reference = getCode(
      await transformReferenceRoute(
        getReferencePlugin(plugins),
        code,
        routeFile,
      ),
    )
    expect(reference).toContain('lazyRouteComponent')
    expect(reference).toContain('lazyFn')
    const virtual = getCode(
      await transformReferenceRoute(
        getCodeSplitterPlugin(plugins, virtualPluginName),
        code,
        `${routeFile}?tsr-split=component`,
      ),
    )
    expect(virtual).toContain('wrapped component')
    expect(virtual).not.toContain('wrapped loader')
  })

  it('refreshes chunk ownership after source changes and isolates split settings', async () => {
    const source = (name: string, value: string) => `
import { createFileRoute } from '@tanstack/react-router'
const ${name} = { value: ${JSON.stringify(value)} }
export const Route = createFileRoute('/changing')({
  loader: () => ${name},
  component: () => ${name},
})`
    // One plugin instance per split setting, each compiling every version of
    // the file, as a dev server does.
    const load = (groupings: CodeSplitGroupings) =>
      createRouteLoader({
        routeId: '/changing',
        pluginOptions: {
          codeSplittingOptions: { defaultBehavior: groupings },
        },
      })
    const separate = load([['component'], ['loader']])
    const combined = load([['component', 'loader']])

    /** The loader's data and the object the component reads. */
    const read = async (route: Awaited<ReturnType<typeof separate>>) => {
      expect([route.isLazy('loader'), route.isLazy('component')]).toEqual([
        true,
        true,
      ])
      const data = await (await route.load('loader'))()
      expect((await route.load('component'))()).toBe(data)
      return data
    }

    expect(
      await read(await separate(source('firstState', 'first version'))),
    ).toEqual({ value: 'first version' })

    const second = await separate(source('secondState', 'second version'))
    for (const output of Object.values(second.modules)) {
      expect(output).not.toContain('firstState')
    }
    expect(await read(second)).toEqual({ value: 'second version' })
    expect(
      await read(await combined(source('secondState', 'second version'))),
    ).toEqual({ value: 'second version' })
    expect(
      (await separate(source('secondState', 'second version'))).modules,
    ).toEqual(second.modules)
  })

  it.each([
    {
      mode: 'production',
      options: {
        command: 'build',
        pluginOptions: { codeSplittingOptions: { addHmr: undefined } },
      },
    },
    {
      mode: 'development with addHmr disabled',
      options: { command: 'serve', hmr: false },
    },
  ] as const)('does not add HMR code in $mode', async ({ options }) => {
    const route = await loadRoute(
      `
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/lowercase')({ component })

function component() {
  return <div>Hello</div>
}
`,
      { routeId: '/lowercase', ...options },
    )
    for (const [name, code] of Object.entries(route.modules)) {
      expect(code, name).not.toMatch(/import\.meta\.(?:webpackHot|hot)\b/)
    }
    expect(route.isLazy('component')).toBe(true)
    expect((await route.load('component'))()).toBe('<div>Hello</div>')
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
    // Code added twice would declare its bindings twice.
    expect(await getModuleErrors(firstCode!)).toEqual([])

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
    // The route module accepts its hot updates, and React Refresh registers
    // its component.
    const accept = vi.fn()
    await evaluateModule(
      hmrCode!,
      {
        '@tanstack/react-router': {
          createFileRoute: () => (options: unknown) => ({ options }),
        },
      },
      { importMeta: { hot: { data: {}, accept, dispose() {} } } },
    )
    expect(accept).toHaveBeenCalled()
    await expectRegisteredRouteOption(hmrCode!, 'component')
  })
})
