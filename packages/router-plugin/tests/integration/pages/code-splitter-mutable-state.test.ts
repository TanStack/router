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
})
