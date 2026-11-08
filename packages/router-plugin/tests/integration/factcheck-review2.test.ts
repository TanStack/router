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

const entry = `${clientMountEntry}
export const effects = () => (globalThis as any).__effects
`

/** Runs the entry and reports the effects its route module ran as it evaluated. */
async function effectsAtLoad(route: string) {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    minify: false,
    files: routeApp(route, { env: 'client', files: { 'entry.ts': entry } }),
  })
  const { result } = await app.run('return entry.effects()')
  return result
}

const effect = `${head}
const effects: Array<string> = ((globalThis as any).__effects = [])
function fx(name: string) {
  effects.push(name)
  return 1
}
fx('before')
`

// A member's initializer runs as the module evaluates: an enum with an impure
// one doesn't move into the lazy chunk of its only reader.
test(
  'a computed enum member a split component reads runs in order when the route module evaluates',
  async () => {
    expect(
      await effectsAtLoad(`${effect}enum E { A = fx('enum') }
fx('after')
export const Route = createFileRoute('/')({ component: () => <p>{E.A}</p> })
`),
    ).toEqual(['before', 'enum', 'after'])
  },
  timeout,
)

test(
  'control: an enum of pure members moves with its only reader',
  async () => {
    const app = await build({
      bundler: 'vite',
      env: 'client',
      minify: false,
      files: routeApp(
        `${head}enum E { A = 1, B = A << 1, C = 'MARK_ENUM' }
export const Route = createFileRoute('/')({ component: () => <p>{Object.keys(E).length}</p> })
`,
        { env: 'client', files: { 'entry.ts': clientMountEntry } },
      ),
    })
    expect(app.where('MARK_ENUM')).toBe('lazy')
  },
  timeout,
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

const stateRoute = `${head}let state = 0
export const Route = createFileRoute('/')({
  loader: () => 1,
  component: () => <p>{state}</p>,
})
`

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
