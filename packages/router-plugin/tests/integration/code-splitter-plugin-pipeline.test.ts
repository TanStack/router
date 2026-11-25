import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { captureDiagnostics } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  diagnosticsOf,
  expectNoDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expect, it } from 'vitest'
import { tanstackRouter } from '../../src/vite'
import { build, clientMountEntry, head, routeApp } from '../build-harness'
import type { RouterPluginOptions } from '../build-harness'

// A route file that both imports and declares `Route` is invalid TypeScript
// (TS2440). A real build either fails with an error, or
// builds a page that renders; it never builds a page that breaks. The
// error is read on every channel the build reports through (the thrown
// error, the bundler's, the console: SPEC §5.7). Source: review of #8504.
it.each(['vite', 'rspack'] as const)(
  'a route file that imports and declares Route fails its build with an error, or renders (%s)',
  async (bundler) => {
    let outcome: string
    const { result, diagnostics } = await captureDiagnostics(async () => {
      try {
        return {
          app: await build({
            bundler,
            env: 'client',
            files: routeApp(
              `import { createFileRoute } from '@tanstack/react-router'
import { Route } from '../other'
export const Route = createFileRoute('/')({ component: () => <p>page</p> })
`,
              {
                env: 'client',
                files: { 'other.ts': 'export const Route = 1\n' },
              },
            ),
          }),
        }
      } catch (error) {
        if (error instanceof BuildError) {
          return { error }
        }
        throw error
      }
    })
    if (result.app) {
      outcome = String(
        (
          await result.app.run(
            `await entry.mount(entry.Route.options.component)`,
          )
        ).html,
      )
    } else {
      const reported = [...diagnosticsOf(result.error), ...diagnostics]
      outcome =
        findDiagnostics(reported, { severity: 'error' }).length > 0
          ? 'refused with an error'
          : `refused without an error:\n${reported.map((diagnostic) => diagnostic.text).join('\n')}`
    }
    expect([
      'refused with an error',
      '<div id="root"><p>page</p></div>',
    ]).toContain(outcome)
  },
  60_000,
)

// The Solid router cannot run in process (code-splitter-plugin-pipeline's
// Solid route is checked at compile level there): a real Vite build of a
// Solid route with its loader and component in groups of their own, run in
// Chromium. Both options load lazily, the loader gives its data and the
// component renders. (The other bundlers' Solid builds:
// build-frameworks.test.ts; the groupings are decided by the transform.)
it('splits the loader and the component of a Solid route into their own groups (vite)', async () => {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    framework: 'solid',
    files: routeApp(
      `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: () => 'MARK_LOADER',
  component: () => <ul>{'MARK_COMPONENT'}</ul>,
})
`,
      { env: 'client', framework: 'solid' },
    ),
  })
  // The scripts the page loaded once the loader ran, before the component.
  const run = await app.run(`const data = await entry.Route.options.loader()
const loaded = performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname)
await entry.mount(entry.Route.options.component)
return { data, loaded }`)
  const { data, loaded } = run.result as { data: string; loaded: Array<string> }
  const componentChunks = app.chunks
    .filter((chunk) => chunk.code.includes('MARK_COMPONENT'))
    .map((chunk) => chunk.fileName)
  expect({
    loader: app.where('MARK_LOADER'),
    component: app.where('MARK_COMPONENT'),
    data,
    componentLoadedWithLoader: componentChunks.filter((chunk) =>
      loaded.some((url) => url.endsWith(`/${chunk}`)),
    ),
    html: run.html,
  }).toEqual({
    loader: 'lazy',
    component: 'lazy',
    data: 'MARK_LOADER',
    componentLoadedWithLoader: [],
    html: '<div id="root"><ul>MARK_COMPONENT</ul></div>',
  })
}, 60_000)

/** What a build reported about its route file, on every channel. */
const aboutRoute = (app: { root: string }) =>
  ({ severity: 'warning', file: 'routes/index.tsx', root: app.root }) as const
const reported = (app: {
  warnings: Array<unknown>
  consoleMessages: Array<unknown>
}) => [...app.warnings, ...app.consoleMessages]

/**
 * A Vite `pre` plugin whose filter is anchored at the file's extension: it
 * transforms `route.tsx`, and not `route.tsx?tsr-split=…`, whose text the
 * compiler reads from disk.
 */
function anchoredPrePlugin(rewrite: (code: string) => string) {
  return (config: RouterPluginOptions) => [
    {
      name: 'anchored-pre-plugin',
      enforce: 'pre',
      transform(code: string, id: string) {
        return /routes\/index\.tsx$/.test(id) ? rewrite(code) : null
      },
    },
    tanstackRouter(config),
  ]
}

const stateRoute = `${head}let state = 0
export const Route = createFileRoute('/')({
  loader: () => 1,
  component: () => <p>{state}</p>,
})
`

// Two texts, two plans: the plugin's text writes `state`, so its plan keeps
// `state` in the route module; the chunk's text (no plugin) never writes it,
// so its plan gives the chunk a copy. Each id compiles from its own text, by
// design, and the build warns naming the route file.
it('a pre plugin that only the route module goes through is reported', async () => {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    minify: false,
    routerPlugins: anchoredPrePlugin((code) =>
      code
        .replace(
          'let state = 0',
          'let state = 0\n;(globalThis as any).__bump = () => { state = 42 }',
        )
        .replace(
          'loader: () => 1',
          'loader: () => { (globalThis as any).__bump(); return state }',
        ),
    ),
    files: routeApp(stateRoute, {
      env: 'client',
      files: { 'entry.ts': clientMountEntry },
    }),
  })
  expect(
    findDiagnostics(reported(app), aboutRoute(app)).length,
  ).toBeGreaterThan(0)
}, 60_000)

// A plugin whose filter accepts queries gives every id of the file the same
// text: nothing is reported
it('a pre plugin that handles every id of the route file is not reported', async () => {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    minify: false,
    routerPlugins: (config: RouterPluginOptions) => [
      {
        name: 'query-agnostic-pre-plugin',
        enforce: 'pre',
        transform(code: string, id: string) {
          return /routes\/index\.tsx(\?|$)/.test(id)
            ? code.replace('let state = 0', 'let state = 1')
            : null
        },
      },
      tanstackRouter(config),
    ],
    files: routeApp(stateRoute, {
      env: 'client',
      files: { 'entry.ts': clientMountEntry },
    }),
  })
  expectNoDiagnostic(reported(app), aboutRoute(app))
}, 60_000)
