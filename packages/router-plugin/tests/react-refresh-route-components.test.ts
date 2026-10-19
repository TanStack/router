/**
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place. Whether an edit shows in
 * place with the component's state is tested on a real page
 * (integration/route-hmr-browser-names.test.ts,
 * integration/route-hmr-browser-options.test.ts). Here: the route modules
 * the HMR transforms emit keep the route's components working, and modules
 * importing the route module's exports get the components the route uses
 * (a real importer module in a Vite dev server running the real plugin).
 */
import { describe, expect, it } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import {
  expectExportedRouteOptions,
  expectSharedOverloads,
  exportedComponentsLostWhenSplit,
  importFromRouteModule,
} from './dev-server'
import {
  evaluateModule,
  getRouteOption,
  head,
  renderComponent,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import type { ExportedRouteOptionsCase } from './dev-server'

describe('route HMR keeps route components working under their names', () => {
  // Source: ReactFreshBabelPlugin-test "registers top-level exported function
  // declarations" and "registers top-level exported named arrow functions";
  // the former "renamed lowercase and exported (%s), keeping what importers
  // get". That an edit shows in place: integration/route-hmr-browser
  // -names.test.ts.
  it.each([
    [
      'export function page',
      `export function page() { return <p>hi</p> }`,
      'page',
    ],
    [
      'export { page }',
      `const page = () => <p>hi</p>\nexport { page }`,
      'page',
    ],
    [
      'export default page',
      `function page() { return <p>hi</p> }\nexport default page`,
      'default',
    ],
  ])(
    'a lowercase component exported as %s is what a module importing it gets (autoCodeSplitting: false)',
    async (_, declaration, name) => {
      const { imported } = await importFromRouteModule(
        `${head}${declaration}\nexport const Route = createFileRoute('/page')({ component: page })`,
        [name, 'Route'],
        { autoCodeSplitting: false },
      )
      expect(imported[name]).toBe(imported.Route.options.component)
      expect(await renderComponent(imported[name])).toBe('<p>hi</p>')
    },
    30_000,
  )

  // Source: ReactFreshBabelPlugin-test "does not consider require-like methods to be HOCs"
  it('leaves an imported lowercase component to the module that declares it', async () => {
    const code = await transformWithRouteHmrPlugin(
      `${head}import { page } from './page'
export const Route = createFileRoute('/')({ component: page })`,
    )
    const page = () => null
    expect(
      await getRouteOption(code, 'component', { './page': { page } }),
    ).toBe(page)
  })

  // Source: ReactFreshBabelPlugin-test "registers top-level function
  // declarations" (an inner binding with the component's name)
  it('keeps an inner binding named like the lowercase component working', async () => {
    const code = await transformWithRouteHmrPlugin(
      `${head}function page() {
  const page = 'inner-marker'
  return <p>{page}</p>
}
export const Route = createFileRoute('/')({ component: page })`,
    )
    expect(await getModuleErrors(code)).toEqual([])
    const { Route } = await evaluateModule(code, {
      '@tanstack/react-router': {
        createFileRoute: () => (options: unknown) => ({ options }),
      },
    })
    expect(await renderComponent((Route as any).options.component)).toBe(
      '<p>inner-marker</p>',
    )
  })
})

// Inline, root route, lowercase and exported route components, options
// added beside a component and custom hooks, as React Refresh patches them
// on a real page: integration/route-hmr-browser-names.test.ts and
// integration/route-hmr-browser-options.test.ts (they replace the checks of
// which names React Refresh's transform registered and of the hook
// signatures it computed, V1 HMR-17). Split route components written inline
// in a memo / forwardRef call: route-hmr-browser.test.ts. A route file
// creates one route (ruling 2026-10-18): no test of components of other
// routes a function of the file creates.

// A route module stays a React Refresh boundary in Vite:
// route-hmr-browser.test.ts (a real page).

describe('route HMR leaves options React Refresh does not handle as they are', () => {
  // Loosened: the method keeps working. Being refreshable is the goal pinned
  // by the "method shorthand" rows of known-bugs-route-hmr.test.ts.
  it('keeps a method-shorthand component option working', async () => {
    const code = await transformWithRouteHmrPlugin(
      `${head}export const Route = createFileRoute('/')({
  component() {
    return <p>hi</p>
  },
})`,
    )
    expect(await getModuleErrors(code)).toEqual([])
    const component = await getRouteOption(code, 'component')
    expect(await renderComponent(component)).toBe('<p>hi</p>')
  })
})

/**
 * React HMR renames and hoists route components, and may split them out of
 * the route module. Modules that import the route module's exports still need
 * them, as the same values the route options use. These tests serve the
 * route file and a module importing its exports from a Vite dev server
 * running the real plugin (`importFromRouteModule`).
 *
 * Source: #8504 react-refresh-route-components "route module exports with
 * React HMR and autoCodeSplitting". The class, aliased and overload-alias
 * cases fail with automatic code splitting; they are pinned in
 * known-bugs-dev-server.test.ts.
 */
describe.each([true, false])(
  'route module exports with React HMR and autoCodeSplitting=%s',
  (autoCodeSplitting) => {
    const cases: Array<ExportedRouteOptionsCase> = [
      {
        name: 'function',
        declaration: 'export function component() { return <p>function</p> }',
        options: 'component',
        exported: { component: ['component'] },
      },
      {
        name: 'overloaded function',
        declaration:
          "import type { ReactNode } from 'react'\nexport function component(): ReactNode\nexport function component() { return <p>overloaded</p> }",
        options: 'component',
        exported: { component: ['component'] },
      },
      {
        name: 'function used by two options',
        declaration:
          'export function component() { return <p>two options</p> }',
        options: 'component, errorComponent: component',
        exported: { component: ['component', 'errorComponent'] },
      },
      {
        name: 'variable',
        declaration: 'export const component = () => <p>variable</p>',
        options: 'component',
        exported: { component: ['component'] },
      },
      {
        name: 'variables declared together',
        declaration:
          'export const component = () => <p>component</p>, pendingComponent = () => <p>pending</p>',
        options: 'component, pendingComponent',
        exported: {
          component: ['component'],
          pendingComponent: ['pendingComponent'],
        },
      },
      {
        name: 'default',
        declaration:
          'export default function component() { return <p>default</p> }',
        options: 'component',
        exported: { default: ['component'] },
      },
      ...(autoCodeSplitting ? [] : exportedComponentsLostWhenSplit),
    ]

    it.each(cases)(
      'keep a $name component exported as the route option value',
      async ({ declaration, options, exported }) => {
        await expectExportedRouteOptions(
          `${head}${declaration}
export const Route = createFileRoute('/page')({ ${options} })`,
          exported,
          autoCodeSplitting,
        )
      },
      30_000,
    )

    if (!autoCodeSplitting) {
      it('keep exported overloads and their aliases that unsplit and split options call', async () => {
        await expectSharedOverloads(autoCodeSplitting)
      }, 30_000)
    }
  },
)
