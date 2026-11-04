// Slow-tier half of this suite: the tests that need a real tool. Its
// page tests are in pages/code-splitter-module-state.test.ts.
import { describe, expect, it } from 'vitest'
import {
  build,
  buildAndRun,
  head,
  rootRoute,
  ssrRenderEntry,
} from '../build-harness'

const varsDeclaredAgain: ReadonlyArray<{
  name: string
  code: string
  rolldownReadsFirst?: boolean
}> = [
  {
    name: 'a for-of head',
    code: `var x = 1\nfor (var x of [2]) {}`,
    rolldownReadsFirst: true,
  },
  {
    name: 'a for-in head',
    code: `var x = 1\nfor (var x in { 2: 0 }) {}`,
    rolldownReadsFirst: true,
  },
  { name: 'a for head', code: `var x = 1\nfor (var x = 2; false; ) {}` },
  {
    name: 'a nested statement',
    code: `var x = 1\nif (globalThis.Object) {\n  var x = 2\n}`,
  },
  { name: 'a block', code: `var x = 1\n{\n  var x = 2\n}` },
  {
    name: 'a pattern in a nested statement',
    code: `var x = 1\n{\n  var { x } = { x: 2 }\n}`,
    rolldownReadsFirst: true,
  },
  {
    name: 'a nested statement above a declaration without a value',
    code: `{\n  var x = 2\n}\nvar x`,
  },
  { name: 'a second declaration', code: `var x = 1\nvar x = 2` },
]

type Bundler = 'vite' | 'rspack'

/** One app: a route per row; each row's split component rendered. */
async function varDeclaredAgain(
  bundler: Bundler,
  rows: ReadonlyArray<(typeof varsDeclaredAgain)[number]>,
) {
  const app = await build({
    bundler,
    env: 'ssr',
    minify: false,
    prefix: '.regression-build-',
    files: {
      'routes/__root.tsx': rootRoute,
      ...Object.fromEntries(
        rows.map(({ code }, i) => [
          `routes/r${i}.tsx`,
          `${head}${code}
export const Route = createFileRoute('/')({ component: () => <p>{x}</p> })
`,
        ]),
      ),
      'entry.ts': `${ssrRenderEntry.replace(/^export \{ Route \}.*$/m, '')}
${rows.map((_, i) => `import { Route as R${i} } from './routes/r${i}'`).join('\n')}
export const routes = [${rows.map((_, i) => `R${i}`).join(', ')}]
`,
    },
  })
  try {
    const { result } = await app.run(
      `return Promise.all(entry.routes.map((r) => entry.render(r.options.component)))`,
    )
    return rows.map(({ name }, i) => [name, (result as Array<string>)[i]])
  } finally {
    await app.dispose()
  }
}

describe('split chunks keep the module state the route relies on', () => {
  // Route files commonly export a store or helpers over private state next to
  // the route and use them from the route component as well.
  it('renders a split component using exported bindings over private state like the unsplit route', async () => {
    const result = await buildAndRun(
      `${head}const state = { count: 0 }
export function increment() {
  return ++state.count
}
let renders = 0
export function getRenders() {
  return renders
}
const initial = 0
export const store = { count: initial }
function Page() {
  increment()
  renders++
  store.count++
  return <p>{[state.count, getRenders(), store.count - initial].join('/')}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      `const component = entry.Route.options.component
return [await entry.render(component), await entry.render(component), entry.store.count]`,
      // The app imports the exported store too
      {
        files: {
          'entry.ts': `${ssrRenderEntry}export { store } from './routes/index'\n`,
        },
      },
    )
    // Known limitation on main: the chunk gets its own copy of `state` and
    // `renders`, so callers of the exported functions are not checked here.
    // Pinned in known-bugs-code-splitter.test.ts ("a binding read by an exported function").
    // `store.count` is 2: the chunk mutated the store the route module exports
    expect(result).toEqual(['<p>1/1/1</p>', '<p>2/2/2</p>', 2])
  }, 30_000)

  // `export default count` holds the first value of `count`; the split
  // component reads the binding itself, which `bump()` changes.
  it('gives the split component the live value of a `let` the route file also exports by default', async () => {
    const result = await buildAndRun(
      `${head}let count = 0
export function bump() {
  count++
}
export default count
export const Route = createFileRoute('/')({
  loader: () => count,
  component: () => <p>{count}</p>,
})
`,
      `const component = entry.Route.options.component
const before = await entry.render(component)
entry.bump()
return [before, await entry.render(component), entry.Route.options.loader(), entry.first]`,
      {
        files: {
          'entry.ts': `${ssrRenderEntry}export { bump, default as first } from './routes/index'\n`,
        },
      },
    )
    expect(result).toEqual(['<p>0</p>', '<p>1</p>', 1, 0])
  }, 30_000)

  // `export default items` above `var items = …` holds `undefined` (the
  // statement runs before the initialiser); the split component reads the
  // binding, which has its value by then. With a loader reading it too
  // (`items` stays in the route module) and without.
  it.each([
    { name: 'a loader reads it too', loader: 'loader: () => items.length,' },
    { name: 'only the component reads it', loader: '' },
  ])(
    'gives the split component the value of a `var` the route file exports by default before declaring it ($name)',
    async ({ loader }) => {
      const result = await buildAndRun(
        `${head}export default items
var items = ['a', 'b']
export const Route = createFileRoute('/')({
  ${loader}
  component: () => <p>{items.join()}</p>,
})
`,
        `return [await entry.render(entry.Route.options.component), entry.first === undefined]`,
        {
          files: {
            'entry.ts': `${ssrRenderEntry}export { default as first } from './routes/index'\n`,
          },
        },
      )
      expect(result).toEqual(['<p>a,b</p>', true])
    },
    30_000,
  )

  // A later `var` changes the binding, not what the export took.
  it.each([
    { name: 'a loader reads it too', loader: 'loader: () => items.length,' },
    { name: 'only the component reads it', loader: '' },
  ])(
    'gives the split component the value a later `var` gives the binding the route file exports by default ($name)',
    async ({ loader }) => {
      const result = await buildAndRun(
        `${head}var items = ['a']
export default items
var items = ['b']
export const Route = createFileRoute('/')({
  ${loader}
  component: () => <p>{items.join()}</p>,
})
`,
        `return [await entry.render(entry.Route.options.component), entry.first]`,
        {
          files: {
            'entry.ts': `${ssrRenderEntry}export { default as first } from './routes/index'\n`,
          },
        },
      )
      expect(result).toEqual(['<p>b</p>', ['a']])
    },
    30_000,
  )

  // Only the deleted option reads `a`: the literal keeps both calls, so `b`
  // gets the second value.
  it('gives a binding of a destructured array literal its value when a deleted option read the one before it', async () => {
    const result = await buildAndRun(
      `${head}let calls = 0
const next = () => ++calls
const [a, b] = [next(), next()]
export const Route = createFileRoute('/')({
  server: { handlers: { GET: () => new Response(String(a)) } },
  component: () => <p>{b}</p>,
})
`,
      `return await entry.render(entry.Route.options.component)`,
      { deleteNodes: ['server'] },
    )
    expect(result).toBe('<p>2</p>')
  }, 30_000)

  // A `var` declared again takes the new value there, like an assignment:
  // the split component sees the binding's last value, whatever the
  // statement giving it is.
  it.each(['vite', 'rspack'] as const)(
    'gives the split component the value a `var` declared again takes (%s)',
    async (bundler) => {
      const rows = varsDeclaredAgain.filter(
        (row) => bundler !== 'vite' || !row.rolldownReadsFirst,
      )
      expect(await varDeclaredAgain(bundler, rows)).toEqual(
        rows.map(({ name }) => [name, '<p>2</p>']),
      )
    },
    60_000,
  )

  // Bug: Rolldown inlines the initial value of a `var` another module imports
  // when its next declaration is a for-in/of head or a pattern, in valid
  // output (KNOWN-BUGS, "Upstream issues").
  // Impact: the split component reads the first value.
  it.fails(
    'gives the split component the value a `var` declared again takes in a head or a pattern (Rolldown)',
    async () => {
      const rows = varsDeclaredAgain.filter((row) => row.rolldownReadsFirst)
      expect(await varDeclaredAgain('vite', rows)).toEqual(
        rows.map(({ name }) => [name, '<p>2</p>']),
      )
    },
    60_000,
  )

  it('gives a value read between two declarations of a `var` the first one', async () => {
    const result = await buildAndRun(
      `${head}var x = 1
const before = x
var x = 2
export const Route = createFileRoute('/')({
  loader: () => x,
  component: () => <p>{before}</p>,
})
`,
      `return [await entry.render(entry.Route.options.component), entry.Route.options.loader()]`,
    )
    expect(result).toEqual(['<p>1</p>', 2])
  }, 30_000)

  // Source: #8504 (code-splitter-exported-bindings-identity.test.ts).
  it('gives the split component the state the route file configures before it creates it', async () => {
    const html = await buildAndRun(
      `${head}import { configure, createStore } from '../store'
configure(5)
const store = createStore()
export function useCount() {
  return store.count
}
function Page() {
  return <p>{useCount()}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      `return await entry.render(entry.Route.options.component)`,
      {
        files: {
          'store.ts': `let initial = 0
export function configure(count: number) {
  initial = count
}
export function createStore() {
  return { count: initial }
}
`,
        },
      },
    )
    expect(html).toBe('<p>5</p>')
  }, 30_000)
})
