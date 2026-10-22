/**
 * Router plugin options and entry points: what each option changes in a
 * real app, through the public plugins in a real Vite dev server.
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  captureThrow,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { createRouterPluginContext } from '../src/context'
import {
  tanStackRouterCodeSplitter,
  tanstackRouterGenerator,
} from '../src/vite'
import { createReactDevPage, renderProbe } from './dev-page'
import { head, loadRoute } from './route-app'
import type { Config } from '../src'

const timeout = 120_000

// TanStack Start splits each environment with its own code splitter, scoped
// with `environmentName` and sharing one router plugin context
// (start-plugin-core's start router plugin): both environments compile the
// route with the same plugin instances, and each instance compiles the route
// file, its chunks and its shared module in its own environment only.
test(
  'two code splitters scoped to the client and SSR environments of one dev server each split a route whose loader and component share a binding',
  async () => {
    const host = await createReactDevPage({
      files: {
        'routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
        'routes/index.tsx': `${head}const label = { text: 'MARK_SHARED' }
function Page() {
  return 'MARK_COMPONENT ' + label.text
}
export const Route = createFileRoute('/')({
  loader: () => label,
  component: Page,
})
`,
        // Server rendering in the SSR environment, as an app's server entry
        'src/ssr.ts': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route } from '../routes/index'
export async function read() {
  const { component, loader } = Route.options
  await component.preload?.()
  return [renderToString(createElement(component)), loader(), loader() === loader()]
}
`,
      },
      plugins: (app) => {
        const context = createRouterPluginContext()
        const config: Partial<Config> = {
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
    const expected = [
      'MARK_COMPONENT MARK_SHARED',
      { text: 'MARK_SHARED' },
      // The loader returns the object the component reads
      true,
    ]
    // The SSR environment: its module runner, React's server renderer
    const ssr = await host.importServer('/src/ssr.ts')
    expect(await ssr.read()).toEqual(expected)
    // The client environment: the page loads the route from the dev server
    const client = await host.runClient(
      '/routes/index.tsx',
      `const { render } = await import(${JSON.stringify(renderProbe)})
const { component, loader } = module.Route.options
return [await render(component), loader(), loader() === loader()]`,
    )
    expect(client.result).toEqual(expected)
    expect(client.errors).toEqual([])
  },
  timeout,
)

describe('repeated options in split groupings', () => {
  test('in a route are refused with an error naming the route file and the option', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['loader', 'component']],
  loader: () => 'data',
  component: () => <p>page</p>,
})
`,
      { filename: 'groupings-route.tsx' },
    )
    // The error the compile throws, with what every channel reported (the
    // wording and the channel are free, SPEC §5.7)
    const thrown = await captureThrow(() => route.transform())
    expect(thrown).not.toEqual([])
    expectDiagnostic([...thrown, ...(await route.diagnostics())], {
      severity: 'error',
      file: 'groupings-route.tsx',
      root: route.host.root,
      names: ['loader'],
    })
  })
})
