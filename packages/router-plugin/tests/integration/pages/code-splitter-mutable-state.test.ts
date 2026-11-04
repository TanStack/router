/**
 * Eager reads of module state something writes (SPEC G3, J2.4, J2.12): a
 * value computed when the route module loads is the value the source
 * computed, whoever writes the binding later and wherever the reader
 * ends up; a chunk never assigns a binding it imports; and the route's
 * option values run after the declarations before them. Routes load in a
 * real browser page from a real dev server (`./route-app`); the modules a
 * route file imports are files of the app, which record what ran.
 */
import { describe, expect, it } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { expectValidModules, head, loadRoute } from '../../route-app'
import type { RouteApp } from '../../route-app'

/** Whether the run reported an option of the route file as not code-split. */
async function reportsNotSplit(route: RouteApp) {
  return (
    findDiagnostics(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
    }).length > 0
  )
}

describe('eager reads of module state something writes', () => {
  // Each component writes a module `let` the previous one reads and the
  // route module reads only the first: whatever is split, no chunk assigns
  // a binding it imports (a chain of three writers once outlived the
  // compiler's re-planning rounds).
  it('renders every component of a chain of writers', async () => {
    const route = await loadRoute(`${head}let a = 0, b = 0, c = 0
export const Route = createFileRoute('/')({
  loader: () => a,
  component: () => { a = 1; return <p>{b}</p> },
  errorComponent: () => { b = 1; return <p>{c}</p> },
  notFoundComponent: () => { c = 1; return <p>nf</p> },
})
`)
    await expectValidModules(route)
    expect(
      await route.run(`return [
  await render('component'),
  await render('errorComponent'),
  await render('notFoundComponent'),
  options.loader(),
]`),
    ).toEqual(['<p>0</p>', '<p>0</p>', '<p>nf</p>', 1])
    expect(await reportsNotSplit(route)).toBe(true)
  })

  it.each([
    ['an array literal', 'const initial = [n]', 'initial[0]'],
    ['a static class field', 'class Snap { static value = n }', 'Snap.value'],
  ])(
    'gives %s its value from when the route module loaded, not from when the component loads',
    async (_, declaration, read) => {
      const route = await loadRoute(`${head}let n = 0
export function inc() { n++ }
${declaration}
export const Route = createFileRoute('/')({
  component: () => <p>{${read}}</p>,
})
`)
      await expectValidModules(route)
      // `inc()` runs before the component chunk loads (a loader of another
      // route, the app's entry): the initial value stays the source's
      expect(
        await route.run(`exports.inc()
return await render('component')`),
      ).toBe('<p>0</p>')
    },
  )

  it.each([
    ['an immediately invoked function', 'const snapshot = (() => cfg.n)()', {}],
    [
      'a call reading a member',
      "import { read } from './read'\nconst snapshot = read(cfg.n)",
      { 'read.ts': 'export const read = (value: number) => value\n' },
    ],
  ])(
    'gives a snapshot by %s of an object a function mutates its value from when the route module loaded',
    async (_, declaration, files) => {
      const route = await loadRoute(
        `${head}export const cfg = { n: 1 }
export function bump() { cfg.n++ }
${declaration}
export const Route = createFileRoute('/')({
  component: () => <p>{snapshot}</p>,
})
`,
        { files },
      )
      await expectValidModules(route)
      expect(
        await route.run(`exports.bump()
return await render('component')`),
      ).toBe('<p>1</p>')
    },
  )

  // The route's option values run at route creation, after every
  // declaration before them in the source, whoever reads those declarations.
  it('runs a declaration only the component reads before an impure option value', async () => {
    const route = await loadRoute(
      `${head}import { createStore, makeSchema } from './state'
const store = createStore()
function Page() { return <p>{store.get()}</p> }
export const Route = createFileRoute('/')({
  component: Page,
  validateSearch: makeSchema(),
})
`,
      {
        files: {
          'state.ts': `export const calls: Array<string> = []
export const createStore = () => {
  calls.push('createStore')
  return { get: () => calls.length }
}
export const makeSchema = () => {
  calls.push('makeSchema')
  return (search: unknown) => search
}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`const html = await render('component')
return [html, (await app('state.ts')).calls]`),
    ).toEqual(['<p>2</p>', ['createStore', 'makeSchema']])
  })
})
