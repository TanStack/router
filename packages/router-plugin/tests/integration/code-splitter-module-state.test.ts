// Slow-tier half of this suite: the tests that need a real tool. Its
// page tests are in pages/code-splitter-module-state.test.ts.
import { describe, expect, it } from 'vitest'
import { buildAndRun, head, ssrRenderEntry } from '../build-harness'

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
