/**
 * A split option that assigns a module `let` other code of the route file
 * also uses: a chunk cannot assign a binding it imports, so that option stays
 * in the route module (one binding, every assignment seen by every reader).
 * The route is loaded the way an app loads it (`route-app.ts`).
 */
import { describe, expect, it } from 'vitest'
import { expectValidModules, head, loadRoute } from './route-app'

const counterRoute = (groupings: string) => `${head}let count = 0
export const Route = createFileRoute('/')({
  loader: () => {
    count++
    return count
  },
  component: () => {
    count++
    return <p>{count}</p>
  },${groupings}
})
`

describe('a split option assigning a module `let` other code uses', () => {
  it.each([['the loader stays in the route module', '']])(
    'keeps one binding when %s',
    async (_, groupings) => {
      const route = await loadRoute(counterRoute(groupings))
      await expectValidModules(route)
      expect(await route.isLazy('component')).toBe(false)
      expect(
        await route.run(
          `return [await options.loader(), await render('component')]`,
        ),
      ).toEqual([1, '<p>2</p>'])
    },
  )
})
