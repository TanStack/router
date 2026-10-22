/**
 * Not part of the compiler test corpus (out of scope: debug logging of the
 * router plugin, which changes no emitted code; SPEC §8 "internal controls",
 * V1 HMR-09).
 *
 * The route HMR plugin's debug output is opt-in (`TSR_VITE_DEBUG`): serving
 * a route prints it only when the variable names the router plugin. Other
 * output (e.g. a warning) is free either way: the tests compare what serving
 * the same route prints with and without the variable.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { expect, onTestFinished, test, vi } from 'vitest'
import { rootRouteOf } from '../dev-server'

// The temporary apps stand in for apps in the tests directory, so their
// imports resolve to this package's dependencies.
const harnessDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const timeout = 30_000

// Vite's SSR transform serves `import.meta` as `__vite_ssr_import_meta__`
const hasRouteHmr = (code: string) =>
  /(?:import\.meta|__vite_ssr_import_meta__)\.hot\b/.test(code)

/**
 * Serves a route of `target` with automatic code splitting off (the route
 * HMR plugin) through the router plugin loaded with `TSR_VITE_DEBUG` set to
 * `debug` (unset when `undefined`; the plugin reads it when its modules
 * load), and returns what it printed with `console.log` / `info` / `debug`,
 * the app's root replaced by `<root>`.
 */
async function printedWhileServing(
  target: 'react' | 'solid',
  debug: string | undefined,
) {
  vi.stubEnv('TSR_VITE_DEBUG', debug)
  vi.resetModules()
  const { tanstackRouter } = await import('../../src/vite')
  vi.unstubAllEnvs()
  let root = ''
  const { diagnostics } = await captureConsole(async () => {
    const server = await createDevServer({
      dir: harnessDir,
      prefix: '.router-dev-server-',
      registerCleanup: onTestFinished,
      files: {
        'routes/__root.tsx': rootRouteOf(target),
        'routes/index.tsx': `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({ loader: () => 'x', component: () => <p>x</p> })`,
      },
      plugins: (app) => [
        tanstackRouter({
          target,
          autoCodeSplitting: false,
          routesDirectory: path.join(app.root, 'routes'),
          generatedRouteTree: path.join(app.root, 'routeTree.gen.ts'),
        }),
      ],
    })
    root = server.root
    expect(
      hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
    ).toBe(true)
  })
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === 'info')
    .map((diagnostic) => diagnostic.text.split(root).join('<root>'))
}

// Source: r5-gaps N9 (rp:1420, 1442, 1455, 1936: debug output on by
// default).
test.for(['react', 'solid'] as const)(
  'with default options, serving a %s route prints none of the debug output TSR_VITE_DEBUG=router-plugin adds',
  { timeout },
  async (target) => {
    const debugging = await printedWhileServing(target, 'router-plugin')
    const printed = await printedWhileServing(target, undefined)
    const added = debugging.filter((line) => !printed.includes(line))
    expect(added).not.toEqual([])
    expect(printed.filter((line) => !debugging.includes(line))).toEqual([])
  },
)

// `TSR_VITE_DEBUG` scopes debug output by package: `start-plugin-core`
// (start-plugin-core/src/debug.ts) is Start's, not the router plugin's.
// Source: r5-gaps borderline rp:1938 (any set value turning router-plugin
// debug output on).
test(
  "with TSR_VITE_DEBUG=start-plugin-core, serving a route prints nothing of the router plugin's debug output",
  async () => {
    expect(await printedWhileServing('react', 'start-plugin-core')).toEqual(
      await printedWhileServing('react', undefined),
    )
  },
  timeout,
)
