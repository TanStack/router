import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import { tanstackRouter } from '../src/vite'
import {
  loadRouteOption,
  rootRoute,
  routerDevServer,
  routerPackageStub,
} from './dev-server'
import {
  createRouteLoader,
  evaluateModule,
  expectRegisteredRouteOption,
} from './regression-helpers'
import type { CodeSplitGroupings } from '../src/core/constants'
import type { TransformResult, UnpluginOptions } from 'unplugin'

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
  it('refreshes chunk ownership after source changes and isolates split settings', async () => {
    const source = (name: string, value: string) => `
import { createFileRoute } from '@tanstack/react-router'
const ${name} = { value: ${JSON.stringify(value)} }
export const Route = createFileRoute('/changing')({
  loader: () => ${name},
  component: () => (
    <p>
      {${name}.value} {String(Route.useLoaderData() === ${name})}
    </p>
  ),
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

    /**
     * The route rendered by the router: the value the component reads and
     * whether the loader's data is that same object. Then checks which
     * options load together: activating an option of a group makes the
     * whole group available, another group stays unrequested.
     */
    const read = async (
      route: Awaited<ReturnType<typeof separate>>,
      groups: Array<Array<string>>,
    ) => {
      const html = await route.renderRoute()
      expect(await route.groups()).toEqual(groups)
      return html
    }
    const separateGroups = [['component'], ['loader']]

    expect(
      await read(
        await separate(source('firstState', 'first version')),
        separateGroups,
      ),
    ).toBe('<p>first version true</p>')

    const second = await separate(source('secondState', 'second version'))
    for (const output of Object.values(second.modules)) {
      expect(output).not.toContain('firstState')
    }
    expect(await read(second, separateGroups)).toBe(
      '<p>second version true</p>',
    )
    expect(
      await read(await combined(source('secondState', 'second version')), [
        ['component', 'loader'],
      ]),
    ).toBe('<p>second version true</p>')
    expect(
      (await separate(source('secondState', 'second version'))).modules,
    ).toEqual(second.modules)
  })

  // Two router plugins in one dev server (each with its own routes
  // directory and route tree): each compiles its own route files, once.
  it('keeps two router plugins of one dev server to their own route files', async () => {
    const route = (routePath: string, label: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
function Page() {
  return '${label}'
}
export const Route = createFileRoute('${routePath}')({ component: Page })
`
    const server = await routerDevServer({
      plugins: [
        routerPackageStub(),
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes-b',
          generatedRouteTree: './routeTree-b.gen.ts',
          autoCodeSplitting: true,
        }),
      ],
      files: {
        'routes/owned.tsx': route('/owned', 'owned'),
        'routes-b/__root.tsx': rootRoute,
        'routes-b/other.tsx': route('/other', 'other'),
      },
    })
    for (const [url, label] of [
      ['/routes/owned.tsx', 'owned'],
      ['/routes-b/other.tsx', 'other'],
    ]) {
      // Code added twice would declare its bindings twice.
      expect(await getModuleErrors(await server.transform(url!)), url).toEqual(
        [],
      )
      const { Route } = await server.import(url!)
      const component = await loadRouteOption(Route.options.component)
      expect(component, url).not.toBe(Route.options.component)
      expect((component as () => string)(), url).toBe(label)
    }
  }, 30_000)

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
