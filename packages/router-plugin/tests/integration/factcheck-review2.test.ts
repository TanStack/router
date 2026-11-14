/**
 * Fact-check of external review 2 (claims 5 and 8), in real Vite builds. Each
 * pin asserts the correct behaviour and fails on the current compiler; each
 * control runs the same harness on a case that works.
 */
import { expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { tanstackRouter } from '../../src/vite'
import { build, clientMountEntry, head, routeApp } from '../build-harness'
import type { RouterPluginOptions } from '../build-harness'

const timeout = 60_000

const routeWarnings = (diagnostics: unknown) =>
  findDiagnostics(diagnostics, { severity: 'warning' }).filter(({ text }) =>
    text.includes('routes/index.tsx'),
  )

// A specifier naming a member of Object.prototype must not find it in a table
// of known packages or markers.
test.each(['constructor', '__proto__', 'toString'])(
  'an import from a package named %s builds',
  async (name) => {
    const app = await build({
      bundler: 'vite',
      env: 'client',
      minify: false,
      files: routeApp(
        `${head}import { x } from '${name}'
export const Route = createFileRoute('/')({ component: () => <p>{x}</p> })
`,
        {
          env: 'client',
          files: {
            'entry.ts': clientMountEntry,
            [`node_modules/${name}/package.json`]: JSON.stringify({
              name,
              type: 'module',
              exports: './index.js',
            }),
            [`node_modules/${name}/index.js`]: `export const x = 'MARK_X'\n`,
          },
        },
      ),
    })
    expect(app.where('MARK_X')).toBe('lazy')
  },
  timeout,
)

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
// design, and the build says so.
test(
  'a pre plugin that only the route module goes through is reported',
  async () => {
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
    expect(routeWarnings(app.warnings).length).toBeGreaterThan(0)
  },
  timeout,
)

// A plugin whose filter accepts queries, a BOM and a source map comment: every
// id of the file gets the same text, or a difference that is no plugin's.
test.each([
  [
    'a plugin that handles every id',
    (config: RouterPluginOptions) => [
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
    stateRoute,
  ],
  ['a BOM', undefined, `\uFEFF${stateRoute}`],
  [
    'a source map comment',
    undefined,
    `${stateRoute}//# sourceMappingURL=data:application/json,{}\n`,
  ],
])(
  'nothing is reported for %s',
  async (_name, routerPlugins, route) => {
    const app = await build({
      bundler: 'vite',
      env: 'client',
      minify: false,
      routerPlugins,
      files: routeApp(route, {
        env: 'client',
        files: { 'entry.ts': clientMountEntry },
      }),
    })
    expect(routeWarnings(app.warnings)).toEqual([])
  },
  timeout,
)
