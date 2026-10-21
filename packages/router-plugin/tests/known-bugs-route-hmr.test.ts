/**
 * Known route HMR bugs of the modules the compiler emits for development.
 * Each test asserts correct behaviour for a bug on main and is marked
 * .fails; remove .fails when the bug is fixed.
 *
 * The route file, the modules the test gives and a module importing the
 * route module run in a real page served by a Vite dev server with the
 * router plugin and React's plugin (`route-app.ts`): the real hot context,
 * React Refresh, the real router.
 *
 * Pins of what the page shows after an edit (React Refresh keeping state,
 * lowercase, inline and exported components) run a real dev server and a
 * real browser page (`route-hmr-page.ts`):
 * integration/known-bugs-route-hmr.test.ts.
 */
import { parseSync } from 'vite'
import { describe, expect, test } from 'vitest'
import { expectValidModules, head, loadRoute } from './route-app'
import type { ESTree } from 'vite'

/** Top-level names a module declares (an independent parse). */
function topLevelNames(code: string) {
  const { program } = parseSync('module.js', code, { sourceType: 'module' })
  const names = new Set<string>()
  const addPattern = (pattern: ESTree.Node | null | undefined): void => {
    if (!pattern) {
      return
    }
    switch (pattern.type) {
      case 'Identifier':
        names.add(pattern.name)
        break
      case 'ObjectPattern':
        for (const property of pattern.properties) {
          addPattern(
            property.type === 'RestElement'
              ? property.argument
              : property.value,
          )
        }
        break
      case 'ArrayPattern':
        pattern.elements.forEach((element) => addPattern(element))
        break
      case 'RestElement':
        addPattern(pattern.argument)
        break
      case 'AssignmentPattern':
        addPattern(pattern.left)
        break
    }
  }
  const addDeclaration = (node: ESTree.Node | null | undefined): void => {
    if (!node) {
      return
    }
    if (node.type === 'VariableDeclaration') {
      node.declarations.forEach((declarator) => addPattern(declarator.id))
    } else if (
      (node.type === 'FunctionDeclaration' ||
        node.type === 'ClassDeclaration') &&
      node.id
    ) {
      names.add(node.id.name)
    }
  }
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      statement.specifiers.forEach((specifier) =>
        names.add(specifier.local.name),
      )
    } else if (
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
    ) {
      addDeclaration(statement.declaration as ESTree.Node)
    } else {
      addDeclaration(statement)
    }
  }
  return names
}

describe('generated code', () => {
  // Control for the options-in-a-variable pins below (same harness).
  test.each([
    {
      name: 'an unsplittable root route',
      code: `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => <Outlet />,
})`,
    },
    {
      name: 'a split file route',
      code: `${head}export const Route = createFileRoute('/')({
  component: () => <p>home</p>,
})`,
    },
  ])(
    'inline route options ($name) evaluate to a route with a component',
    async ({ code }) => {
      const route = await loadRoute(code, { hmr: true })
      expect(await route.run(`return typeof options.component`)).toBe(
        'function',
      )
    },
  )

  // Bug: when the route options are passed through a variable, the HMR
  // transforms replace `component` in the options object with a generated
  // binding declared after the object that reads it.
  // Impact: the route module throws a TDZ ReferenceError in development.
  test.fails.each([
    {
      name: 'an unsplittable root route',
      code: `import { createRootRoute, Outlet } from '@tanstack/react-router'
const options = {
  component: () => <Outlet />,
}
export const Route = createRootRoute(options)`,
    },
    {
      name: 'a split file route',
      code: `${head}const options = {
  component: () => <p>home</p>,
}
export const Route = createFileRoute('/')(options)`,
    },
  ])(
    'route options in a variable ($name) evaluate to a route with a component',
    async ({ code }) => {
      const route = await loadRoute(code, { hmr: true })
      expect(await route.run(`return typeof options.component`)).toBe(
        'function',
      )
    },
  )

  /**
   * Names a user binding may take: `hot` (the binding of the bug report),
   * and every top-level name the route module the page receives declares
   * with HMR and not without it (adaptive: whatever names the compiler
   * introduces for HMR, not one spelling of today's), except the names the
   * tools introduce in any module of the app (Vite's hot context, React
   * Refresh): those of a module that is not a route, with components, served
   * by the same dev server.
   */
  async function candidateNames() {
    const code = `${head}const marker = 'marker'
export const Route = createFileRoute('/')({
  component: () => <p>{marker}</p>,
})`
    const hmr = await loadRoute(code, {
      hmr: true,
      files: {
        'widgets.tsx': ['A', 'B', 'C', 'D']
          .map((name) => `export function ${name}() { return <p>${name}</p> }`)
          .join('\n'),
      },
    })
    const withHmr = await hmr.transform()
    const tools = topLevelNames(await hmr.transform('/widgets.tsx'))
    const without = topLevelNames(
      await (await loadRoute(code, { hmr: false })).transform(),
    )
    return [
      ...new Set([
        'hot',
        ...[...topLevelNames(withHmr)].filter(
          (name) => !without.has(name) && !tools.has(name),
        ),
      ]),
    ]
  }

  // Bug: our `react-refresh-ignored-route-exports` compiler plugin injects a
  // top-level `const hot = import.meta.hot` that collides with a user's
  // top-level `hot` binding (compile error `Duplicate declaration "hot"`).
  // Impact: the route cannot be served in development.
  test.fails.each([
    { name: 'a constant', keyword: 'const', exported: false },
    { name: 'an exported constant', keyword: 'export const', exported: true },
  ])(
    'a user binding named hot ($name) does not collide with the injected HMR code',
    async ({ keyword, exported }) => {
      const results: Record<string, unknown> = {}
      for (const name of await candidateNames()) {
        const route = await loadRoute(
          `${head}${keyword} ${name} = 'hot'
export const Route = createFileRoute('/')({
  component: () => <p>{${name}}</p>,
})`,
          {
            hmr: true,
            files: exported
              ? { 'importer.ts': `export { ${name} } from './route'\n` }
              : {},
          },
        )
        try {
          await expectValidModules(route)
          results[name] = await route.run(`return [
  await render('component'),
  ${exported ? `(await app('importer.ts'))[${JSON.stringify(name)}]` : `'hot'`},
]`)
        } catch (error) {
          results[name] = String(error).split('\n')[0]
        }
      }
      // Each module importing it gets the user's value.
      expect(results).toEqual(
        Object.fromEntries(
          Object.keys(results).map((name) => [name, ['<p>hot</p>', 'hot']]),
        ),
      )
    },
  )

  /** `./state`: `init` returns its argument and counts its calls. */
  const state = {
    'state.ts': `export let inits = 0
export const init = (value: number) => {
  inits++
  return value
}
`,
  }

  /**
   * Loads, with HMR, a route whose `page` component (declared by
   * `declaration`) is both the `component` and the `notFoundComponent`,
   * which the default groupings split into two chunks, so the code splitter
   * shares `page` between them. Renders the component, then the not-found
   * component. `page` counts its renders in a module-level `let` initialized
   * by `init` from `./state`. Returns both renders and how many times `init`
   * ran.
   */
  async function renderSharedComponent(declaration: string) {
    const route = await loadRoute(
      `${head}import { init } from './state'
let renders = init(0)
${declaration}
export const Route = createFileRoute('/')({
  component: page,
  notFoundComponent: page,
})`,
      { hmr: true, files: state },
    )
    return route.run(`return [
  await render('component'),
  await render('notFoundComponent'),
  (await app('state.ts')).inits,
]`)
  }

  // Control for the lowercase shared component pin below (same harness).
  test('a lowercase arrow component split into two chunks renders with the module state they share', async () => {
    expect(
      await renderSharedComponent(`const page = () => {
  renders++
  return <p>{renders}</p>
}`),
    ).toEqual(['<p>1</p>', '<p>2</p>', 1])
  })

  // Bug: React HMR renames a lowercase `function` component in its split
  // chunk even when the code splitter moved the component to the shared
  // module, so the chunk exports `SplitComponent`, which nothing declares.
  // Impact: in development, the route's component chunk fails to load
  // (SyntaxError: Export 'SplitComponent' is not defined).
  test.fails(
    'a lowercase function component split into two chunks renders with the module state they share',
    async () => {
      expect(
        await renderSharedComponent(`function page() {
  renders++
  return <p>{renders}</p>
}`),
      ).toEqual(['<p>1</p>', '<p>2</p>', 1])
    },
  )

  // Bug: same root cause as the pin above, for a lowercase component that
  // the split `component` and the unsplit `pendingComponent` share.
  // Impact: in development, the route's component chunk fails to load
  // (SyntaxError: Export 'SplitComponent' is not defined).
  // Source: #8504 react-refresh-route-components ("that is also the unsplit
  // pendingComponent"). That edits of both show in place: the page pin in
  // integration/known-bugs-route-hmr-components.test.ts.
  test.fails(
    'a lowercase function component that is also the unsplit pendingComponent renders as both',
    async () => {
      const route = await loadRoute(
        `${head}function page() {
  return <p>hi</p>
}
export const Route = createFileRoute('/')({ component: page, pendingComponent: page })`,
        { hmr: true },
      )
      await expectValidModules(route)
      expect(
        await route.run(
          `return [await render('component'), await render('pendingComponent')]`,
        ),
      ).toEqual(['<p>hi</p>', '<p>hi</p>'])
    },
  )

  // Bug: with React HMR, the code splitter moves a component exported by an
  // export list (`export { page }`) into its chunk and leaves the export list
  // in the route module (same root cause as known-bugs-code-splitter.test.ts
  // "a split component that an export list reads renders from both").
  // Impact: in development, the route module fails to load
  // (SyntaxError: Export 'page' is not defined).
  // Source: ReactFreshBabelPlugin-test "registers top-level exported function
  // declarations" (`export { Baz }`); #8504 react-refresh-route-components
  // ("keeps a component exported by specifier in the route module"), where it
  // passes. Whether the component is split is the code splitter's goal; either
  // way a module importing the export and the route render the same
  // component. That edits show in place: the page pin in
  // integration/known-bugs-route-hmr-components.test.ts.
  test.fails(
    'a component exported by an export list renders for a module importing it and as the route component',
    async () => {
      const route = await loadRoute(
        `${head}const page = () => <p>hi</p>
export { page }
export const Route = createFileRoute('/')({ component: page })`,
        {
          hmr: true,
          files: { 'importer.ts': `export { page } from './route'\n` },
        },
      )
      await expectValidModules(route)
      expect(
        await route.run(`return [
  await render('component'),
  await renderComponent((await app('importer.ts')).page),
]`),
      ).toEqual(['<p>hi</p>', '<p>hi</p>'])
    },
  )

  // Control for the lowercase shared component pins above: a lowercase
  // `function` loader that the split component also calls.
  test('a lowercase function loader the split component calls loads from its chunk', async () => {
    const route = await loadRoute(
      `${head}function getData() {
  return 'data'
}
export const Route = createFileRoute('/')({
  loader: getData,
  component: () => <p>{getData()}</p>,
  codeSplitGroupings: [['loader'], ['component']],
})`,
      { hmr: true },
    )
    await expectValidModules(route)
    expect(await route.isLazy('loader')).toBe(true)
    expect(
      await route.run(
        `return [await options.loader(), await render('component')]`,
      ),
    ).toEqual(['data', '<p>data</p>'])
  })

  // Control for the hoisted inline component pin (a real page:
  // integration/known-bugs-route-hmr.test.ts "an inline pending component
  // hoisted before a renamed lowercase component"): with the route HMR
  // plugin (automatic code splitting off), an option that is not an inline
  // component, reading a lowercase component a later option passes, gets
  // that component.
  test('an option reading a lowercase component a later option passes gets that component', async () => {
    const route = await loadRoute(
      `${head}const errorFallback = () => <p>error</p>
export const Route = createFileRoute('/')({
  staticData: { errorFallback },
  errorComponent: errorFallback,
})`,
      { hmr: true, pluginOptions: { autoCodeSplitting: false } },
    )
    expect(
      await route.run(`return [
  options.staticData.errorFallback === options.errorComponent,
  await renderComponent(options.errorComponent),
]`),
    ).toEqual([true, '<p>error</p>'])
  })
})
