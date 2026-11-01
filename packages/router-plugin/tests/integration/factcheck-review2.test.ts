/**
 * Fact-check of external review 2 (claims 5 and 8), in real Vite builds. Each
 * pin asserts the correct behaviour and fails on the current compiler; each
 * control runs the same harness on a case that works.
 */
import { expect, test } from 'vitest'
import { tanstackRouter } from '../../src/vite'
import { build, clientMountEntry, head, routeApp } from '../build-harness'
import type { RouterPluginOptions } from '../build-harness'

const timeout = 60_000

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

test(
  'control: an impure const a split component reads runs in order when the route module evaluates',
  async () => {
    expect(
      await effectsAtLoad(`${effect}const value = fx('value')
fx('after')
export const Route = createFileRoute('/')({ component: () => <p>{value}</p> })
`),
    ).toEqual(['before', 'value', 'after'])
  },
  timeout,
)

// `enum E { A = sideEffect() }` counts as pure (purity.ts), so the enum moves
// with its only reader into the lazy chunk: its effect runs when the chunk
// loads, after the effects below it. Main keeps the order.
test.fails(
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

// `markers[specifier]` and `pureCalls?.[specifier]` read plain objects, so a
// specifier naming a member of Object.prototype finds a function: `pure.has`
// is no function and the compile throws. Main builds these. No package of
// these names is common; the failure is a TypeError naming none of this.
test.fails.each(['constructor', '__proto__', 'toString'])(
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
// so its plan gives the chunk a copy. No warning, a wrong value at runtime.
// Main fails this build (MISSING_EXPORT) instead.
test.fails(
  'a pre plugin that only the route module goes through: the loader and the split component read one state, or the build fails',
  async () => {
    let app
    try {
      app = await build({
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
          files: {
            'entry.ts': clientMountEntry,
          },
        }),
      })
    } catch {
      return
    }
    const run = await app.run(
      `const loader = entry.Route.options.loader()
await entry.mount(entry.Route.options.component)
return loader`,
    )
    expect({ loader: run.result, html: run.html }).toEqual({
      loader: 42,
      html: '<div id="root"><p>42</p></div>',
    })
  },
  timeout,
)

// Not a state: a literal the plugin rewrites only reaches the route module's
// copy. Main's route module and chunk share the untransformed text instead
// (the plugin's rewrite is lost on both). Recorded as observed behaviour.
test(
  'a pre plugin that only the route module goes through: a pure const the plugin rewrites differs between the route module and the chunk',
  async () => {
    const app = await build({
      bundler: 'vite',
      env: 'client',
      minify: false,
      routerPlugins: anchoredPrePlugin((code) =>
        code.replaceAll('MARK_RAW', 'MARK_REWRITTEN'),
      ),
      files: routeApp(
        `${head}const label = 'MARK_RAW'
export const Route = createFileRoute('/')({
  loader: () => label,
  component: () => <p>{label}</p>,
})
`,
        { env: 'client', files: { 'entry.ts': clientMountEntry } },
      ),
    })
    const run = await app.run(
      `await entry.mount(entry.Route.options.component)
return entry.Route.options.loader()`,
    )
    expect({ loader: run.result, html: run.html }).toEqual({
      loader: 'MARK_REWRITTEN',
      html: '<div id="root"><p>MARK_RAW</p></div>',
    })
  },
  timeout,
)
