/**
 * The code splitter applied to its own output (the plugin registered twice,
 * each instance transforming every module in turn) gives a route that
 * behaves like one compiled once: the same options load lazily, from the
 * same modules, render the same, and module state is created once.
 */
import { describe, expect, test } from 'vitest'
import { expectValidModules, head, loadRoute } from './regression-helpers'
import type { CodeSplitGroupings } from '../src/core/constants'

const route = `${head}import { track } from './track'
const label = track('label', 'MARK')
function Page() {
  return <p>{label} page</p>
}
function Failure() {
  return <p>{label} failure</p>
}
export const Route = createFileRoute('/')({
  loader: () => label + ' data',
  errorComponent: Failure,
  component: Page,
})
`

const options = ['loader', 'component', 'errorComponent']

async function compileWith(
  instances: number,
  groupings: CodeSplitGroupings | undefined,
  hmr: boolean,
) {
  const evaluations: Array<string> = []
  const loaded = await loadRoute(route, {
    instances,
    hmr,
    pluginOptions: groupings && {
      codeSplittingOptions: { defaultBehavior: groupings },
    },
    stubs: {
      './track': {
        track: (name: string, value: unknown) => {
          evaluations.push(name)
          return value
        },
      },
    },
  })
  await expectValidModules(loaded.modules)
  const rendered = [
    await (await loaded.load('loader'))(),
    (await loaded.load('component'))(),
    (await loaded.load('errorComponent'))(),
  ]
  return {
    lazy: options.filter((option) => loaded.isLazy(option)),
    // Lazy modules are labelled by the options that load them
    modules: Object.keys(loaded.modules).sort(),
    rendered,
    evaluations,
  }
}

const groupingCases = [
  ['default groupings', undefined],
  ['loader and component together', [['loader', 'component']]],
] as const

/**
 * Compiling the route with two plugin instances gives the route one
 * instance gives, or is refused with an error saying the plugin is
 * registered twice.
 */
async function expectSameRouteOrClearError(
  groupings: CodeSplitGroupings | undefined,
  hmr: boolean,
) {
  const once = await compileWith(1, groupings, hmr)
  expect(once.rendered).toEqual([
    'MARK data',
    '<p>MARK page</p>',
    '<p>MARK failure</p>',
  ])
  expect(once.evaluations).toEqual(['label'])
  let twice
  try {
    twice = await compileWith(2, groupings, hmr)
  } catch (error) {
    expect(String(error)).toMatch(
      /twice|more than once|already (?:registered|added)/i,
    )
    return
  }
  expect(twice).toEqual(once)
}

describe.each(groupingCases)('%s', (_, groupings) => {
  test('compiling the output again gives the same route', async () => {
    await expectSameRouteOrClearError(groupings as never, false)
  })

  // Bug: in dev, the second instance adds its route HMR code to a module
  // that already has the first one's, and Babel rejects the result
  // ("Duplicate declaration \"hot\""). Reproduced on a real Vite dev server
  // with `tanstackRouter()` registered twice for the same routes directory
  // (e.g. next to a framework plugin that adds it already).
  // Source: router-code-splitter-plugin.ts (reference transform of a module
  // whose HMR code is already there), compilers.ts (HMR statements).
  // Impact: the dev server fails every route file with a Babel error that
  // does not say the plugin is registered twice.
  test.fails(
    'compiling the output again gives the same route (dev)',
    async () => {
      await expectSameRouteOrClearError(groupings as never, true)
    },
  )
})
