/**
 * What the route module drops with an option the router plugin removes from
 * it: a split option (moved to its chunk, SPEC J2.5) and a `deleteNodes`
 * option (J2.14, Start's client `server` handlers). The removal takes with
 * it, in the route module, what only the removed option used, whatever the
 * shape of the code in between (G16): nothing that loads with the route
 * requests the module only that option imports. Kept code keeps what it
 * reads, and code already dead before the transform keeps running (G3).
 * Each route runs in a real browser page served by a real Vite dev server
 * with the public router plugin (`route-app.ts`). The same shapes run
 * through every removal of the Start compiler in start-plugin-core
 * (`@tanstack/compiler-test-utils/dead-code-shapes`).
 */
import { describe, expect, it } from 'vitest'
import {
  deadCodeShapes,
  depSource,
  recordFile,
  shapeSetup,
} from '@tanstack/compiler-test-utils/dead-code-shapes'
import { expectValidModules, head, loadRoute } from '../../route-app'
import type { RouteAppOptions } from '../../route-app'

interface Removal {
  name: string
  /** The route options around `root`, the expression the removed option returns. */
  options: (root: string) => string
  routeOptions?: RouteAppOptions
  /** The page script that gives what the removed option gives, and its value. */
  check: (expected: unknown) => { script: string; expected: unknown }
}

const removals: Array<Removal> = [
  {
    name: 'a split component',
    options: (root) => `component: () => <p>{${root}}</p>,`,
    check: (expected) => ({
      script: `return render('component')`,
      expected: `<p>${expected}</p>`,
    }),
  },
  {
    // Start's client configuration (SPEC §1.1); the server keeps the
    // handlers (start-plugin-core integration/start-compose-server-only-routes.test.ts).
    name: 'server handlers deleteNodes removes',
    options: (
      root,
    ) => `server: { handlers: { GET: () => new Response(String(${root})) } },
component: () => <p>page</p>,`,
    routeOptions: { deleteNodes: ['server'] },
    check: () => ({
      script: `return ['server' in options, await render('component')]`,
      expected: [false, '<p>page</p>'],
    }),
  },
]

/**
 * Cells main gets wrong (KNOWN-BUGS S7): the route module keeps the class of
 * a class and const cycle only the removed option used, and drops the const
 * its static field reads (`ReferenceError` when the route module loads).
 */
const failsToday = new Set([
  'a split component: a class and a const that read each other',
  'server handlers deleteNodes removes: a class and a const that read each other',
])

describe.each(removals)('$name', (removal) => {
  for (const shape of deadCodeShapes) {
    it(
      `takes with it what only it uses through ${shape.name}`,
      { fails: failsToday.has(`${removal.name}: ${shape.name}`) },
      async () => {
        // A kept loader reads the shared declaration (loaders stay in the
        // route module under the default groupings).
        const loader = shape.kept
          ? `loader: () => ${shape.kept.expression},\n`
          : ''
        const route = await loadRoute(
          `${head}${shapeSetup(shape, './dep')}
export const Route = createFileRoute('/')({
${loader}${removal.options(shape.root)}
})
`,
          {
            ...removal.routeOptions,
            files: { 'dep.ts': depSource, ...recordFile },
          },
        )
        await expectValidModules(route)
        const { script, expected } = removal.check(shape.expected)
        expect(await route.run(script)).toEqual(expected)
        if (shape.kept) {
          expect(await route.run(`return options.loader()`)).toEqual(
            shape.kept.expected,
          )
        } else {
          expect(await route.requested()).not.toContain('/dep.ts')
        }
        if (shape.alreadyDead) {
          expect(
            await route.run(`return [...(await app('record.ts')).calls]`),
          ).toContain('dead')
        }
      },
    )
  }
})
