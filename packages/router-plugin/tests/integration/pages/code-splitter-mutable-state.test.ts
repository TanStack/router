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
import { expectValidModules, head, loadRoute } from '../../route-app'

describe('eager reads of module state something writes', () => {
  // The route's option values run at route creation; a declaration only
  // the component reads has no order with them (no order rule): it runs
  // when the chunk loads.
  it('runs a declaration only the component reads after an impure option value', async () => {
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
    ).toEqual(['<p>2</p>', ['makeSchema', 'createStore']])
  })
})
