/**
 * Not part of the compiler test corpus (out of scope: debug logging of the
 * router plugin, which changes no emitted code). The compiler corpus keeps
 * one "serving a route prints nothing by default" test (route-hmr.test.ts).
 *
 * The route HMR plugin's debug output is opt-in (`TSR_VITE_DEBUG`).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { expect, onTestFinished, test, vi } from 'vitest'
import { rootRouteOf, routerDevServer, routerPackageStub } from '../dev-server'

// The temporary apps live in the tests directory, so their imports resolve
// to this package's dependencies.
const harnessDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const timeout = 30_000

// Vite's SSR transform serves `import.meta` as `__vite_ssr_import_meta__`
const hasRouteHmr = (code: string) =>
  /(?:import\.meta|__vite_ssr_import_meta__)\.hot\b/.test(code)

/** Records what `console.log` / `info` / `debug` print. */
function recordConsole() {
  const printed: Array<string> = []
  for (const method of ['log', 'info', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args) => {
      printed.push(args.map(String).join(' '))
    })
  }
  return printed
}

// Source: r5-gaps N9 (rp:1420, 1442, 1455, 1936: debug output on by
// default).
test(
  'with default options, serving a solid route prints nothing to the console',
  async () => {
    expect(process.env.TSR_VITE_DEBUG).toBeUndefined()
    const printed = recordConsole()
    const server = await routerDevServer({
      pluginOptions: { target: 'solid', autoCodeSplitting: false },
      plugins: [routerPackageStub('solid')],
      files: {
        'routes/index.tsx': `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({ loader: () => 'x', component: () => <p>x</p> })`,
      },
    })
    expect(
      hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
    ).toBe(true)
    vi.restoreAllMocks()
    expect(printed).toEqual([])
  },
  timeout,
)

// `TSR_VITE_DEBUG` scopes debug output by package: `start-plugin-core`
// (start-plugin-core/src/debug.ts) is Start's, not the router plugin's.
// Source: r5-gaps borderline rp:1938 (any set value turning router-plugin
// debug output on).
test(
  "with TSR_VITE_DEBUG=start-plugin-core, serving a route prints nothing of the router plugin's debug output",
  async () => {
    const printed = recordConsole()
    vi.stubEnv('TSR_VITE_DEBUG', 'start-plugin-core')
    // (the plugin reads the variable when its modules load)
    vi.resetModules()
    const { tanstackRouter } = await import('../../src/vite')
    vi.unstubAllEnvs()
    const server = await createDevServer({
      dir: harnessDir,
      prefix: '.router-dev-server-',
      registerCleanup: onTestFinished,
      files: {
        'routes/__root.tsx': rootRouteOf('react'),
        'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ loader: () => 'x' })`,
      },
      plugins: (app) => [
        tanstackRouter({
          target: 'react',
          autoCodeSplitting: false,
          routesDirectory: path.join(app.root, 'routes'),
          generatedRouteTree: path.join(app.root, 'routeTree.gen.ts'),
        }),
        routerPackageStub('react'),
      ],
    })
    expect(
      hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
    ).toBe(true)
    vi.restoreAllMocks()
    expect(printed).toEqual([])
  },
  timeout,
)
