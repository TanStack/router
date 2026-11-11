/**
 * State read inside a callback that runs at module load, in a declaration only
 * the split component reads. Code splitting must not change what a route does
 * (AGENTS.md; core README "effects and mutable state": a reader evaluated at
 * load that observes mutable state never moves to a lazy output). The intended
 * value is what the same code gives unsplit. Real builds, output executed.
 */
import { describe, expect, it } from 'vitest'
import {
  build,
  buildWithRsbuild,
  head,
  rootRoute,
  ssrRenderEntry,
} from '../build-harness'

const state = `let prefix = 'a'\nexport function setPrefix(p: string) { prefix = p }\n`

type Bundler = 'vite' | 'rspack' | 'rsbuild'

/**
 * `component`: the route's component option (default: a component rendering
 * `read`); `state`: the module state and its exported setter (default: `state`);
 * `after`: code after the route; `pin`: the bundlers on which the row is a
 * known bug (KNOWN-BUGS).
 */
const shapes: Record<
  string,
  {
    code: string
    read?: string
    component?: string
    state?: string
    after?: string
    pin?: ReadonlyArray<Bundler>
  }
> = {
  'direct read (control)': { code: `const labels = [prefix + 'x']` },
  map: { code: `const labels = ['x'].map((k) => prefix + k)` },
  forEach: {
    code: `const labels: Array<string> = []\n;['x'].forEach((k) => labels.push(prefix + k))`,
  },
  'forEach inside an IIFE': {
    code: `const labels = (() => { const r: Array<string> = []; ['x'].forEach((k) => r.push(prefix + k)); return r })()`,
  },
  reduce: {
    code: `const labels = ['x'].reduce((acc: Array<string>, k) => [...acc, prefix + k], [])`,
  },
  'new Map of a map': {
    code: `const m = new Map(['x'].map((k) => [k, prefix + k]))\nconst labels = [...m.values()]`,
    read: 'labels',
  },
  'new Map with a callback read by the component': {
    code: `const labels = new Map(['x'].map((k) => [k, prefix + k]))`,
    read: '[...labels.values()]',
  },
  'Array.from with a callback': {
    code: `const labels = Array.from(['x'], (k) => prefix + k)`,
  },
  'Object.fromEntries of a map': {
    code: `const o = Object.fromEntries(['x'].map((k) => [k, prefix + k]))\nconst labels = Object.values(o)`,
  },
  'local IIFE': { code: `const labels = (() => [prefix + 'x'])()` },
  'IIFE through `as`': {
    code: `const labels = ((() => [prefix + 'x']) as () => Array<string>)()`,
  },
  'IIFE through `!`': { code: `const labels = ((() => [prefix + 'x'])!)()` },
  'IIFE through `satisfies`': {
    code: `const labels = ((() => [prefix + 'x']) satisfies () => Array<string>)()`,
  },
  'IIFE called optionally': {
    code: `const labels = (() => [prefix + 'x'])?.()`,
  },
  'IIFE through `.call`': {
    code: `const labels = (function () { return [prefix + 'x'] }).call(null)`,
  },
  'IIFE through `as`, then `.call`': {
    code: `const labels = ((function () { return [prefix + 'x'] }) as () => Array<string>).call(null)`,
  },
  'IIFE through `.bind`': {
    code: `const labels = (function () { return [prefix + 'x'] }).bind(null)()`,
  },
  'function constructed in place': {
    code: `const labels = new (function (this: any) { this.v = [prefix + 'x'] } as any)().v`,
  },
  // without semicolons, a statement in parentheses after an arrow function
  // is a statement of its own: the setter is not called at load
  'setter followed by a statement in parentheses': {
    state: `let prefix = 'a'\nexport const setPrefix = (p: string) => { prefix = p }\n(globalThis as any).loaded = true\n`,
    code: `const labels = [prefix + 'x']`,
  },
  'helper called at load': {
    code: `function make() { return [prefix + 'x'] }\nconst labels = make()`,
  },
  'helper taking a callback': {
    code: `function apply(f: () => string) { return [f()] }\nconst labels = apply(() => prefix + 'x')`,
  },
  'callback defined apart': {
    code: `const f = (k: string) => prefix + k\nconst labels = ['x'].map(f)`,
  },
  'map after a member read': {
    code: `const nav = [{ to: 'x' }]\nconst labels = nav.length > 0 ? nav.map((n) => prefix + n.to) : []`,
  },
  'map, then an element': {
    code: `const labels = ['x'].map((k) => prefix + k)[0]`,
  },
  'filter, then its length': {
    code: `const labels = ['a', 'x'].filter((k) => k === prefix).length`,
  },
  'map in an object next to a global read': {
    code: `const config = { here: typeof globalThis.location, labels: ['x'].map((k) => prefix + k) }`,
    read: 'config.labels',
  },
  'helper updating the state, called by a callback': {
    code: `function next() { return (prefix += '!') }\nconst labels = ['x'].map((k) => k + next())`,
  },
  'option value built by a helper reading the state': {
    code: `function withPrefix(C: () => string) { const p = prefix; return () => <p>{p + C()}</p> }\nfunction Page() { return 'x' }`,
    component: 'withPrefix(Page)',
  },
  // review of 2026-11-10, F1-1: the state's cluster held a top-level
  // `if` or `try` assigning it, and the load walk did not enter it
  'helper updating the state a top-level `if` also assigns': {
    state: `let prefix = 'a'\nif ((globalThis as any).never) { prefix = 'z' }\nexport function setPrefix(p: string) { prefix = p }\n`,
    code: `const next = () => (prefix += '!')\nconst labels = [next()]`,
  },
  'helper updating the state a top-level `try` also assigns': {
    state: `let prefix = 'a'\ntry { prefix = String(prefix) } catch { prefix = 'z' }\nexport function setPrefix(p: string) { prefix = p }\n`,
    code: `const next = () => (prefix += '!')\nconst labels = [next()]`,
  },
  // review of 2026-11-10, F1-2 (its Q1): an extracted module evaluates with
  // the chunk once nothing imports it through the route file, after the
  // setter ran; the snapshot stays in the route module
  'exported snapshot of the state': {
    code: `export const labels = [prefix + 'x']`,
  },
  'read at render (control, the current value is right)': {
    code: `const labels = () => [prefix + 'x']`,
    read: 'labels()',
  },
  // the option value writes the state when the route module loads; a
  // declaration after the route reads it then (design 2 step 3 ruling: O
  // keeps the value in place)
  'a member write in the component option, read after the route': {
    code: `const seen: Array<string> = []\nfunction wrap<T>(value: T) { return value }`,
    component: `wrap(seen.push('x') && (() => <p>{String(count)}</p>))`,
    after: `const count = seen.length`,
  },
  // architect rulings on the design 2 step 3 review: an assignment, a
  // member write of an import, and a write in a function the value's call
  // runs are writes of the value's evaluation too
  'an assignment in the component option, read after the route': {
    code: `let n = 0\nfunction wrap<T>(value: T) { return value }`,
    component: `wrap((n = 1, () => <p>{String(count)}</p>))`,
    after: `const count = n`,
  },
  'a member write of an import in the component option, read after the route': {
    code: `import { registry } from '../registry'\nfunction wrap<T>(value: T) { return value }`,
    component: `wrap((registry.page = 1, () => <p>{String(count)}</p>))`,
    after: `const count = registry.page`,
  },
  'a write in a function the component option passes to a call, read after the route':
    {
      code: `const seen = { n: 0 }\nfunction wrap(f: () => void) { f(); return () => <p>{String(count)}</p> }`,
      component: `wrap(function () { seen.n = 1 })`,
      after: `const count = seen.n`,
    },
}

const rows = Object.entries(shapes)

async function run(bundler: Bundler, split: boolean) {
  const options = {
    pluginOptions: { autoCodeSplitting: split },
    files: {
      'routes/__root.tsx': rootRoute,
      'registry.ts': `export const registry: { page?: number } = {}\n`,
      ...Object.fromEntries(
        rows.map(([, { code, read, component, state: own, after }], i) => [
          `routes/r${i}.tsx`,
          `${head}${own ?? state}${code}
export const Route = createFileRoute('/')({ component: ${component ?? `() => <p>{String(${read ?? 'labels'})}</p>`} })
${after ?? ''}`,
        ]),
      ),
      'entry.ts': `${ssrRenderEntry.replace(/^export \{ Route \}.*$/m, '')}
${rows.map((_, i) => `import { Route as R${i}, setPrefix as S${i} } from './routes/r${i}'`).join('\n')}
export const routes = [${rows.map((_, i) => `R${i}`).join(', ')}]
export const setters = [${rows.map((_, i) => `S${i}`).join(', ')}]
`,
    },
  }
  // Rsbuild: a client build (ES modules), run in Node as the others
  const app =
    bundler === 'rsbuild'
      ? await buildWithRsbuild({ ...options, registerCleanup: () => {} })
      : await build({
          bundler,
          env: 'ssr',
          minify: false,
          prefix: '.state-read-at-load-',
          ...options,
        })
  try {
    const { result } = await app.run(`
      const out = []
      for (let i = 0; i < entry.routes.length; i++) {
        entry.setters[i]('b')
        out.push(await entry.render(entry.routes[i].options.component))
      }
      return out
    `)
    return Object.fromEntries(
      rows.map(([name], i) => [
        name,
        (result as Array<string>)[i]!.replace(/<[^>]*>/g, ''),
      ]),
    )
  } finally {
    await app.dispose()
  }
}

describe.each(['vite', 'rspack', 'rsbuild'] as const)('%s', (bundler) => {
  const results: Record<string, ReturnType<typeof run>> = {}
  const observed = (split: boolean) =>
    (results[String(split)] ??= run(bundler, split))

  describe.each(rows)('%s', (name, { pin }) => {
    ;(pin?.includes(bundler) ? it.fails : it)(
      'gives the value the same code gives unsplit',
      async () => {
        expect((await observed(true))[name]).toBe((await observed(false))[name])
      },
      180_000,
    )
  })
})
