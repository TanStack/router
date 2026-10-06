/**
 * Scenarios ported from React Refresh's Babel plugin and integration tests
 * (facebook/react `packages/react-refresh/src/__tests__/ReactFreshBabelPlugin-test.js`
 * and `ReactFreshIntegration-test.js`, MIT).
 *
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place. That only works when the value
 * is bound to a top-level name React Refresh registers. These tests compile
 * route files with the HMR transforms, then run Vite's Oxc React Refresh
 * transform (the one `@vitejs/plugin-react` uses) on the output to see which
 * components are registered and how their hook signatures are computed.
 */
import { parseSync, transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/** Runs the route HMR plugin used when automatic code splitting is off. */
function compileWithRouteHmr(
  code: string,
  hmrStyle: 'vite' | 'webpack' = 'vite',
) {
  return transformWithRouteHmrPlugin(code, {
    target: 'react',
    plugin: { hmr: { style: hmrStyle } },
  })
}

/** Compiles the reference module and the `component` chunk with React HMR. */
function compileWithCodeSplitting(code: string) {
  const { modules } = compileRouteModules(code, { hmr: true })
  return {
    reference: modules.reference!,
    component: modules['virtual component']!,
  }
}

/**
 * Applies the React Refresh transform and returns the registered component
 * names and the hook signature arguments of each signed binding.
 */
async function reactRefresh(code: string) {
  const result = await transformWithOxc(code, 'route.tsx', {
    jsx: {
      runtime: 'automatic',
      development: true,
      refresh: { emitFullSignatures: true },
    },
  })
  const registered = [
    ...result.code.matchAll(/\$RefreshReg\$\(\w+, "([^"]+)"\)/g),
  ].map((match) => match[1]!)
  const signatures = new Map(
    [...result.code.matchAll(/\b_s\d*\((\w+), ([\s\S]*?)\);\n/g)].map(
      (match) => [match[1]!, match[2]!] as const,
    ),
  )
  return { registered, signatures }
}

function parseModule(code: string) {
  const { program, errors } = parseSync('route.tsx', code, {
    sourceType: 'module',
  })
  expect(errors).toEqual([])
  return program
}

/** Returns the value of `option` in `export const Route = createXRoute(...)({ ... })`. */
function getRouteOption(code: string, option: string) {
  for (const statement of parseModule(code).body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration'
        ? statement.declaration
        : statement
    if (declaration?.type !== 'VariableDeclaration') {
      continue
    }
    for (const declarator of declaration.declarations) {
      if (
        declarator.id.type !== 'Identifier' ||
        declarator.id.name !== 'Route' ||
        declarator.init?.type !== 'CallExpression'
      ) {
        continue
      }
      const options = declarator.init.arguments[0]
      if (options?.type !== 'ObjectExpression') {
        continue
      }
      for (const property of options.properties) {
        if (
          property.type === 'Property' &&
          ((property.key.type === 'Identifier' &&
            property.key.name === option) ||
            (property.key.type === 'Literal' && property.key.value === option))
        ) {
          return property.value
        }
      }
    }
  }
  throw new Error(`expected the \`${option}\` route option`)
}

/** Name of the binding a route option points to, or null for any other expression. */
function getRouteOptionBinding(code: string, option: string) {
  const value = getRouteOption(code, option)
  return value.type === 'Identifier' ? value.name : null
}

/** Names exported by a module (`default` for a default export). */
function exportedNames(code: string) {
  const names: Array<string> = []
  for (const statement of parseModule(code).body) {
    if (statement.type === 'ExportDefaultDeclaration') {
      names.push('default')
    }
    if (statement.type !== 'ExportNamedDeclaration') {
      continue
    }
    for (const specifier of statement.specifiers) {
      const exported = specifier.exported
      names.push(
        exported.type === 'Identifier' ? exported.name : String(exported.value),
      )
    }
    const declaration = statement.declaration
    if (
      (declaration?.type === 'FunctionDeclaration' ||
        declaration?.type === 'ClassDeclaration') &&
      declaration.id
    ) {
      names.push(declaration.id.name)
    }
    if (declaration?.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        if (declarator.id.type === 'Identifier') {
          names.push(declarator.id.name)
        }
      }
    }
  }
  return names.sort()
}

/** Asserts that `option` points to a binding React Refresh registers. */
async function expectRegisteredRouteOption(code: string, option: string) {
  expect(await getModuleErrors(code)).toEqual([])
  const binding = getRouteOptionBinding(code, option)
  expect(binding).not.toBeNull()
  const { registered } = await reactRefresh(code)
  expect(registered).toContain(binding)
  return binding!
}

describe('ported React Refresh: component registration', () => {
  // Source: ReactFreshBabelPlugin-test "registers top-level variable declarations with function expressions"
  // and "registers top-level variable declarations with arrow functions"
  it.each([
    ['an arrow function', `() => <p>hi</p>`],
    ['an anonymous function expression', `function () { return <p>hi</p> }`],
    ['a named function expression', `function Page() { return <p>hi</p> }`],
    ['an async arrow function', `async () => <p>hi</p>`],
    ['a parenthesized arrow function', `(() => <p>hi</p>)`],
  ])('registers an inline component written as %s', async (_, component) => {
    const code = await compileWithRouteHmr(
      `${head}export const Route = createFileRoute('/')({ component: ${component} })`,
    )
    await expectRegisteredRouteOption(code, 'component')
  })

  // Source: ReactFreshBabelPlugin-test "registers top-level variable declarations with arrow functions"
  it('registers every inline component option of a root route', async () => {
    const options = {
      component: '() => <p>component</p>',
      pendingComponent: '() => <p>pending</p>',
      errorComponent: '({ error }) => <p>{String(error)}</p>',
      notFoundComponent: '() => <p>not found</p>',
      shellComponent: '({ children }) => <html><body>{children}</body></html>',
    }
    const { reference } = compileWithCodeSplitting(
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
${Object.entries(options)
  .map(([key, value]) => `  ${key}: ${value},`)
  .join('\n')}
})`,
    )
    const bindings = new Set<string>()
    for (const option of Object.keys(options)) {
      bindings.add(await expectRegisteredRouteOption(reference, option))
    }
    expect(bindings.size).toBe(Object.keys(options).length)
  })

  // Source: ReactFreshBabelPlugin-test "only registers pascal case functions"
  // and "uses original function declaration if it get reassigned"
  it.each([
    ['a function declaration', `function page() { return <p>hi</p> }`],
    ['a const arrow function', `const page = () => <p>hi</p>`],
    [
      'a function expression that names itself',
      `const page = function page() { return <p>{typeof page}</p> }`,
    ],
    [
      'a reassigned function declaration',
      `import { connect } from './connect'\nfunction page() { return <p>hi</p> }\npage = connect(page)`,
    ],
  ])(
    'renames a lowercase component declared as %s so it is registered',
    async (_, declaration) => {
      const code = await compileWithRouteHmr(
        `${head}${declaration}\nexport const Route = createFileRoute('/')({ component: page })`,
      )
      const binding = await expectRegisteredRouteOption(code, 'component')
      expect(binding).toMatch(/^[A-Z]/)
    },
  )

  // Source: ReactFreshBabelPlugin-test "registers top-level exported function declarations"
  // and "registers top-level exported named arrow functions"
  it.each([
    ['export function page', `export function page() { return <p>hi</p> }`],
    ['export const page', `export const page = () => <p>hi</p>`],
    ['export { page }', `const page = () => <p>hi</p>\nexport { page }`],
    [
      'export default function page',
      `export default function page() { return <p>hi</p> }`,
    ],
    [
      'export default page',
      `function page() { return <p>hi</p> }\nexport default page`,
    ],
  ])(
    'keeps the exports of a renamed lowercase component (%s)',
    async (_, declaration) => {
      const source = `${head}${declaration}\nexport const Route = createFileRoute('/')({ component: page })`
      const code = await compileWithRouteHmr(source)
      await expectRegisteredRouteOption(code, 'component')
      // React Refresh also needs a component export that it can treat as one.
      expect(exportedNames(code)).toEqual(
        [...exportedNames(source), 'TSRFastRefreshAnchor'].sort(),
      )
    },
  )

  // Source: ReactFreshBabelPlugin-test "registers top-level function declarations"
  it('keeps a PascalCase component under its own name', async () => {
    const code = await compileWithRouteHmr(
      `${head}function Page() { return <p>hi</p> }
export const Route = createFileRoute('/')({ component: Page })`,
    )
    expect(await expectRegisteredRouteOption(code, 'component')).toBe('Page')
  })

  // Source: ReactFreshBabelPlugin-test "does not consider require-like methods to be HOCs"
  it('leaves an imported lowercase component to the module that declares it', async () => {
    const code = await compileWithRouteHmr(
      `${head}import { page } from './page'
export const Route = createFileRoute('/')({ component: page })`,
    )
    expect(getRouteOptionBinding(code, 'component')).toBe('page')
    expect(code).toMatch(/import \{ page \} from ['"]\.\/page['"]/)
  })

  // Source: ReactFreshBabelPlugin-test "registers likely HOCs with inline functions"
  // and "registers capitalized identifiers in HOC calls"
  it.each([
    [
      'memo with an inline function',
      `import { memo } from 'react'\nconst page = memo(() => <p>hi</p>)`,
      ['TSRComponent$memo', 'TSRComponent'],
    ],
    [
      'a HOC wrapping a component',
      `import { withAuth } from './auth'\nfunction Page() { return <p>hi</p> }\nconst page = withAuth(Page)`,
      ['Page', 'TSRComponent'],
    ],
  ])(
    'registers a lowercase binding created by %s',
    async (_, declaration, families) => {
      const code = await compileWithRouteHmr(
        `${head}${declaration}\nexport const Route = createFileRoute('/')({ component: page })`,
      )
      expect(await expectRegisteredRouteOption(code, 'component')).toBe(
        'TSRComponent',
      )
      expect((await reactRefresh(code)).registered).toEqual(
        expect.arrayContaining(families),
      )
    },
  )

  // Source: ReactFreshBabelPlugin-test "registers top-level function declarations" (handleClick is not renamed)
  it('does not rename an inner binding that shadows the component name', async () => {
    const code = await compileWithRouteHmr(
      `${head}function page() {
  const page = 'inner'
  return <p>{page}</p>
}
export const Route = createFileRoute('/')({ component: page })`,
    )
    await expectRegisteredRouteOption(code, 'component')
    expect(code).toMatch(/const page = ['"]inner['"]/)
    expect(code).toContain('{page}')
  })

  // Source: ReactFreshBabelPlugin-test "uses custom identifiers for $RefreshReg$ and $RefreshSig$" (webpack-style runtimes)
  it('registers inline components with webpack-style HMR as well', async () => {
    const code = await compileWithRouteHmr(
      `${head}export const Route = createFileRoute('/')({ component: () => <p>hi</p> })`,
      'webpack',
    )
    await expectRegisteredRouteOption(code, 'component')
  })

  // Source: ReactFreshIntegration-test "preserves state ..." (families are matched by registration name)
  it('names hoisted components after their option, so adding options keeps the family', async () => {
    const before = await compileWithRouteHmr(
      `${head}export const Route = createFileRoute('/')({ component: () => <p>v1</p> })`,
    )
    const after = await compileWithRouteHmr(
      `${head}export const Route = createFileRoute('/')({
  pendingComponent: () => <p>pending</p>,
  errorComponent: () => <p>error</p>,
  component: () => <p>v2</p>,
})`,
    )
    expect(await expectRegisteredRouteOption(after, 'component')).toBe(
      await expectRegisteredRouteOption(before, 'component'),
    )
  })
})

describe('ported React Refresh: hook signatures', () => {
  /** Signature of `Page` when the user declares the component themselves. */
  async function handWrittenSignature(declarations: string, component: string) {
    const { signatures } = await reactRefresh(
      `${declarations}\nconst Page = ${component}\nexport const Route = {}`,
    )
    return signatures.get('Page')
  }

  // Source: ReactFreshBabelPlugin-test "generates signatures for function declarations calling hooks",
  // "includes custom hooks into the signatures" and "can handle implicit arrow returns"
  it.each([
    {
      name: 'built-in hooks',
      declarations: `import { useEffect, useState } from 'react'`,
      component: `() => {
  const [count, setCount] = useState(0)
  useEffect(() => {})
  return <p onClick={() => setCount(count + 1)}>{count}</p>
}`,
    },
    {
      name: 'a custom hook declared in the route file',
      declarations: `import { useState } from 'react'
function useCounter() {
  const [count] = useState(0)
  return count
}`,
      component: `() => {
  const count = useCounter()
  return <p>{count}</p>
}`,
    },
    {
      name: 'an implicit arrow return',
      declarations: `import { useContext } from 'react'
import { Theme } from './theme'`,
      component: `() => useContext(Theme)`,
    },
    {
      name: 'route API hooks',
      declarations: ``,
      component: `() => {
  const data = Route.useLoaderData()
  return <p>{data}</p>
}`,
    },
  ])(
    'keeps the signature of an inline component using $name',
    async ({ declarations, component }) => {
      const expected = await handWrittenSignature(declarations, component)
      expect(expected).toBeDefined()
      const source = `${head}${declarations}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: ${component},
})`

      const hmr = await compileWithRouteHmr(source)
      const hoisted = await expectRegisteredRouteOption(hmr, 'component')
      expect((await reactRefresh(hmr)).signatures.get(hoisted)).toBe(expected)

      // The split chunk must sign the component the same way.
      const { component: chunk } = compileWithCodeSplitting(source)
      const chunkSignatures = (await reactRefresh(chunk)).signatures
      expect([...chunkSignatures.values()]).toContain(expected)
    },
  )
})

describe('ported React Refresh: @refresh reset', () => {
  // Source: ReactFreshIntegration-test "resets state on every edit with @refresh reset annotation"
  // React Refresh (Babel, SWC) forces a remount when the module contains the
  // comment, so it must reach every module that holds the component.
  it.each([
    ['as a file header', `/* @refresh reset */\n${head}`, ''],
    ['inside the component', head, '// @refresh reset\n'],
  ])(
    'keeps // @refresh reset %s in the modules holding the component',
    async (_, header, body) => {
      const source = `${header}import { useState } from 'react'
export const Route = createFileRoute('/')({
  component: () => {
    ${body}const [count] = useState(0)
    return <p>{count}</p>
  },
})`
      expect(await compileWithRouteHmr(source)).toContain('@refresh reset')
      expect(compileWithCodeSplitting(source).component).toContain(
        '@refresh reset',
      )
    },
  )
})

describe('ported React Refresh: generated names', () => {
  // Source: none upstream (React Refresh's own `_c`/`_s` names must not collide either);
  // covers names the hoisting generates.
  it.each([
    [
      'a top-level const',
      `const TSRComponent = 'taken'`,
      `<p>{TSRComponent}</p>`,
    ],
    ['an import', `import { TSRComponent } from './taken'`, `<TSRComponent />`],
    [
      'a function declared after the route',
      ``,
      `<p>{TSRComponent()}</p>`,
      `\nfunction TSRComponent() { return 'taken' }`,
    ],
  ])('does not reuse a name held by %s', async (_, before, jsx, after = '') => {
    const code = await compileWithRouteHmr(
      `${head}${before}
export const Route = createFileRoute('/')({ component: () => ${jsx} })${after}`,
    )
    const binding = await expectRegisteredRouteOption(code, 'component')
    expect(binding).not.toBe('TSRComponent')
    // The user's binding is still declared and still referenced.
    expect(code).toMatch(/\bTSRComponent\b/)
  })

  it('does not capture a global the component reads', async () => {
    const code = await compileWithRouteHmr(
      `${head}export const Route = createFileRoute('/')({
  component: () => <p>{typeof TSRPendingComponent}</p>,
  pendingComponent: () => <p>pending</p>,
})`,
    )
    const pending = await expectRegisteredRouteOption(code, 'pendingComponent')
    expect(pending).not.toBe('TSRPendingComponent')
    // `TSRPendingComponent` must stay an unresolved global inside `component`.
    expect(code).not.toMatch(
      /\b(?:const|let|var|function|class)\s+TSRPendingComponent\b/,
    )
  })
})
