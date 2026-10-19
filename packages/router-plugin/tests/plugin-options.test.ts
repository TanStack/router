/**
 * Router plugin options and entry points, through real builds: what each
 * option changes in the output or on disk.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createDevServer,
  evaluateServed,
} from '@tanstack/compiler-test-utils/dev-server'
import { describe, expect, onTestFinished, test } from 'vitest'
import { routeHead } from './build-harness'
import {
  renderRouteComponent,
  rootRouteOf,
  servedRouterPackageUrl,
} from './dev-server'
import { compileRouteModules, head } from './regression-helpers'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'
import type { RouterPluginOptions } from './build-harness'

const timeout = 120_000

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

const read = (app: BuildResult, file: string) =>
  readFile(path.join(app.root, file), 'utf8').catch(() => null)

// TanStack Start splits each environment with its own code splitter, scoped
// with `environmentName` and sharing one router plugin context
// (start-plugin-core's start router plugin): both environments compile the
// route with the same plugin instances, and each instance compiles the route
// file, its chunks and its shared module in its own environment only.
test(
  'two code splitters scoped to the client and SSR environments of one dev server each split a route whose loader and component share a binding',
  async () => {
    const { createRouterPluginContext } = await import('../src/context')
    const { tanStackRouterCodeSplitter, tanstackRouterGenerator } =
      await import('../src/vite')
    const server = await createDevServer({
      dir: harnessDir,
      prefix: '.router-dev-server-',
      registerCleanup: onTestFinished,
      files: {
        'routes/__root.tsx': rootRouteOf('react'),
        'routes/index.tsx': `${routeHead()}const label = { text: 'MARK_SHARED' }
function Page() {
  return 'MARK_COMPONENT ' + label.text
}
export const Route = createFileRoute('/')({
  loader: () => label,
  component: Page,
})
`,
      },
      plugins: (app) => {
        const context = createRouterPluginContext()
        const config: RouterPluginOptions = {
          target: 'react',
          autoCodeSplitting: true,
          routesDirectory: path.join(app.root, 'routes'),
          generatedRouteTree: path.join(app.root, 'routeTree.gen.ts'),
          codeSplittingOptions: { addHmr: false },
        }
        return [
          tanstackRouterGenerator(config, context),
          ...(['client', 'ssr'] as const).map((environmentName) =>
            tanStackRouterCodeSplitter(
              { ...config, plugin: { vite: { environmentName } } },
              context,
            ),
          ),
        ]
      },
    })
    /** Renders the route's split component, and the loader's value. */
    const read = async (routeModule: Record<string, any>) => {
      const { options } = routeModule.Route
      return [await renderRouteComponent(options.component), options.loader()]
    }
    const expected = ['MARK_COMPONENT MARK_SHARED', { text: 'MARK_SHARED' }]
    expect(await read(await server.import('/routes/index.tsx'))).toEqual(
      expected,
    )
    // The browser gets the router package from the dev server; evaluated
    // here from the same SSR-loaded module.
    const routerPackage = await server.import('@tanstack/react-router')
    expect(
      await read(
        await evaluateServed(server, '/routes/index.tsx', {
          skip: /^\/@fs\//,
          stubs: {
            [await servedRouterPackageUrl(server)]: routerPackage,
          },
        }),
      ),
    ).toEqual(expected)
  },
  timeout,
)

describe('codeSplittingOptions.splitBehavior', () => {
  test('that is not a function is refused when the plugin is created, naming the option', async () => {
    const { tanstackRouter } = await import('../src/vite')
    expect(() =>
      tanstackRouter({
        codeSplittingOptions: { splitBehavior: [['loader']] as any },
      }),
    ).toThrow(/splitBehavior/)
  })
})

describe('repeated options in split groupings', () => {
  test('in defaultBehavior are refused with an error naming the option', async () => {
    const { tanstackRouter } = await import('../src/vite')
    expect(() =>
      tanstackRouter({
        codeSplittingOptions: {
          defaultBehavior: [['loader'], ['loader', 'component']],
        },
      }),
    ).toThrow(
      /loader[\s\S]*(?:unique|repeated|more than once|duplicate)|(?:unique|repeated|more than once|duplicate)[\s\S]*loader/i,
    )
  })

  test('in a route are refused with an error naming the route file and the option', async () => {
    await expect(
      compileRouteModules(
        `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['loader', 'component']],
  loader: () => 'data',
  component: () => <p>page</p>,
})
`,
        { filename: 'groupings-route.tsx' },
      ),
    ).rejects.toThrow(/groupings-route\.tsx[\s\S]*loader/)
  })
})
