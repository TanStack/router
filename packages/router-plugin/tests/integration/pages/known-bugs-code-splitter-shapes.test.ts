/**
 * Known code-splitter bugs (route options and factories written in other
 * shapes, what split chunks hold, names the code splitter generates). Each
 * test asserts the correct behaviour for a bug main had, which today's
 * compiler fixes (a regression test, oracle/KNOWN-BUGS.md). Same harness as
 * `known-bugs-code-splitter.test.ts`: every route is loaded the way an app
 * loads it (`./route-app`), each check runs in a real browser page.
 */

import { parseSync } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  diagnosticsOf,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  expectValidModules,
  head,
  holdsMarker,
  loadRoute,
} from '../../route-app'
import type { RouteApp } from '../../route-app'

/**
 * The modules of the app the served module `code` depends on (static
 * imports, re-exports and dynamic imports), as the requests the dev server
 * resolved them to (`/lib.ts`): an independent parse of what the page
 * receives, for SPEC J2.5 checks that a split chunk does not depend on a module of
 * the app that its option does not use (SPEC J2.5).
 */
function dependencies(code: string) {
  const { module } = parseSync('module.js', code, { sourceType: 'module' })
  const requests = [
    ...module.staticImports.map((statement) => statement.moduleRequest.value),
    ...module.staticExports.flatMap((statement) =>
      statement.entries.flatMap((entry) =>
        entry.moduleRequest ? [entry.moduleRequest.value] : [],
      ),
    ),
    ...module.dynamicImports.map((dynamicImport) =>
      code
        .slice(
          dynamicImport.moduleRequest.start,
          dynamicImport.moduleRequest.end,
        )
        .replace(/^['"`]|['"`]$/g, ''),
    ),
  ]
  return requests.map((request) => request.split('?')[0]!)
}

/**
 * Whether the dev server warned, on any channel, naming the route file
 * (J2.8: an option the compiler leaves unsplit is reported; the wording is
 * free).
 */
async function reportsNotSplit(route: RouteApp) {
  return (
    findDiagnostics(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
    }).length > 0
  )
}

describe('route options written in other shapes', () => {
  // Bug: a route whose options object or factory call is wrapped in a
  // TypeScript cast is not split at all, and a component wrapped in
  // `satisfies` cannot be split: the virtual compiler throws
  // "Unexpected splitNode type ☝️: TSSatisfiesExpression". These are our
  // limitations, so the goal is a split
  // component (SPEC J2.8).
  // Sources: real apps: openalgon-alt/agri-prep-path
  // src/routes/admin/access.tsx (`createFileRoute('/admin/access')({ … } as
  // any)`); differential fuzzing (casts around the route factory call);
  // React Router route-chunks-test.ts "chunkable" detection of export
  // values; #8504 (code-splitter-route-options.test.ts), where they pass.
  // Impact: the component loads with the entry chunk, or the route cannot
  // be built once code splitting is on.
  test.each([
    {
      name: 'the options object wrapped in `as any`',
      route: `createFileRoute('/')({ ssr: false, component: Page } as any)`,
    },
    {
      name: 'the options object wrapped in `satisfies object`',
      route: `createFileRoute('/')({ ssr: false, component: Page } satisfies object)`,
    },
    {
      name: 'the route factory call wrapped in `as any`',
      route: `(createFileRoute('/') as any)({ ssr: false, component: Page })`,
    },
  ])('a component is split with $name', async ({ route }) => {
    const loaded = await loadRoute(`${head}export const Route = ${route}
function Page() {
  return <p>page</p>
}
`)
    expect(await loaded.renderLazy('component')).toEqual({
      lazy: true,
      html: '<p>page</p>',
    })
  })

  // Controls for the pins above and in "route factories written in other
  // shapes": these routes keep working (split or not), so the pins fail only
  // because the component is not split.
  test.each([
    `createFileRoute('/')({ ssr: false, component: Page } as any)`,
    `(createFileRoute('/') as any)({ ssr: false, component: Page })`,
    `createFileRoute('/')(makeOptions())`,
  ])('a route written as %s renders its component', async (route) => {
    const loaded = await loadRoute(`${head}function Page() {
  return <p>page</p>
}
const makeOptions = () => ({ component: Page })
export const Route = ${route}
`)
    await expectValidModules(loaded)
    expect(await loaded.run(`return render('component')`)).toBe('<p>page</p>')
  })
})

describe('route factories written in other shapes', () => {
  // Bug: the code splitter only compiles files whose code matches
  // `createFileRoute(`, so a route whose factory call has a type argument
  // (`createFileRoute<'/'>('/')`) is left as is, and nothing says so. Our
  // limitation, so the goal is a split component (SPEC J2.8).
  // Source: mutation testing.
  // Impact: the route's components load with the entry chunk, silently.
  test('a component is split when createFileRoute has a type argument', async () => {
    const route = await loadRoute(`${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute<'/'>('/')({ component: Page })
`)
    expect(await route.renderLazy('component')).toEqual({
      lazy: true,
      html: '<p>page</p>',
    })
  })

  // Bug: route options returned by a call (`createFileRoute('/')(
  // makeOptions())`) are neither split nor reported. The user can write the
  // options inline, so a warning naming the file is an acceptable outcome
  // (SPEC J2.8). Source: review of #8504.
  // Impact: the route's components load with the entry chunk, silently.
  test('route options returned by a call are split or reported', async () => {
    // A server of its own: the compiler warns once per file and run, and the
    // control above loads the same file
    const route = await loadRoute(
      `${head}function Page() {
  return <p>page</p>
}
const makeOptions = () => ({ component: Page })
export const Route = createFileRoute('/')(makeOptions())
`,
      { fresh: true },
    )
    expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
    expect({
      split: await route.isLazy('component'),
      warned: await reportsNotSplit(route),
    }).not.toEqual({ split: false, warned: false })
  })

  // Bug: a route file that creates two file routes compiles both routes'
  // split options into the same chunk names, so one route renders the
  // other's component, silently. Supporting it, or refusing it with an error
  // or a warning naming the file, are both valid fixes.
  // Source: review of #8504 (the pin of #8630 was
  // dropped without a decision).
  // Impact: a route renders another route's component.
  test('each of two file routes of one module renders its own component, or the module is reported', async () => {
    const route =
      await loadRoute(`${head}export const Legacy = createFileRoute('/old')({
  component: () => <p>legacy</p>,
})
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})
`)
    const root = route.host.root
    let rendered: unknown
    try {
      await route.transform()
      // Both options rendered, each loaded first when it is lazy
      rendered =
        await route.run(`const legacy = exports.Legacy.options.component
await legacy.preload?.()
return [await renderComponent(legacy), await render('component')]`)
    } catch (error) {
      // A refusal names the file (its wording is free), on any channel
      expectDiagnostic(
        [...diagnosticsOf(error), ...(await route.diagnostics())],
        { severity: 'error', file: 'route.tsx', root },
      )
      return
    }
    if (
      findDiagnostics(await route.diagnostics(), {
        severity: 'warning',
        file: 'route.tsx',
        root,
      }).length > 0
    ) {
      return
    }
    expect(rendered).toEqual(['<p>legacy</p>', '<p>index</p>'])
  })
})

describe('what split chunks hold', () => {
  // Bug: a split chunk keeps every exported `function`, `class` and
  // `export default function` declaration of the route file, with the
  // imports they use, whether its option reads them or not
  // (`compilers.ts`, the virtual compiler keeps exported declarations).
  // Bundlers cannot drop them: the chunk is imported with `import()` and read
  // through a computed key (SPEC J2.5).
  // Impact: every split chunk of the route downloads and evaluates the route
  // file's exported helpers and their dependencies again.
  test('a split chunk holds only what its option needs, not the other exports of the route file', async () => {
    // Each exported declaration carries a marker its code keeps under any
    // name a compiler gives it (SPEC J2.5: identified independently of
    // names)
    const route = await loadRoute(
      `${head}import { heavy } from './heavy'
export function helper() { return heavy() + 'MARK_helper' }
export class Api { call() { return heavy() + 'MARK_api' } }
export default function Def() { return heavy() + 'MARK_def' }
function Page() { return <div>page</div> }
export const Route = createFileRoute('/')({ component: Page })
`,
      { files: { 'heavy.ts': `export const heavy = () => 'heavy'\n` } },
    )
    expect(await route.run(`return render('component')`)).toBe(
      '<div>page</div>',
    )
    // What loading the component requests, and what loads with the route
    // module (the route file's exports, which it keeps)
    const loaded = await route.loadedBy('component')
    const eager = await route.eagerModules()
    expect({
      holds: ['MARK_helper', 'MARK_api', 'MARK_def'].filter((marker) =>
        loaded.some((code) => holdsMarker(code, marker)),
      ),
      dependsOnHeavy: loaded.some((code) =>
        dependencies(code).includes('/heavy.ts'),
      ),
      eagerHolds: ['MARK_helper', 'MARK_api', 'MARK_def'].filter((marker) =>
        eager.some((code) => holdsMarker(code, marker)),
      ),
    }).toEqual({
      holds: [],
      dependsOnHeavy: false,
      eagerHolds: ['MARK_helper', 'MARK_api', 'MARK_def'],
    })
  })

  // Bug: same root cause as above, for re-exports and a default-exported
  // class: every split chunk re-exports them or declares the class again.
  // Source: Next.js ssg/getStaticProps/should-remove-extra-named-export-speicifers,
  // should-support-full-re-export and should-support-class-exports; #8504
  // (code-splitter-imports-exports.test.ts), where it passes.
  // Impact: every split chunk loads the re-exported modules and the class.
  test('split chunks do not re-export or declare the re-exports and default class of the route file', async () => {
    // The class carries a marker its code keeps under any name a
    // compiler gives the class (SPEC J2.5: identified independently
    // of generated names).
    const marker = 'default-class-marker-7f3a'
    const route = await loadRoute(
      `${head}export { getPaths, a as getProps } from './lib'
export { foo, bar as baz } from './lib'
export { helper } from './default-lib'
export default class Test {
  render() {
    return '${marker}'
  }
}
export const Route = createFileRoute('/')({
  component: () => <div>home</div>,
  errorComponent: () => <div>error</div>,
})
`,
      {
        files: {
          'lib.ts': `export const getPaths = 1
export const a = 2
export const foo = 3
export const bar = 4
`,
          'default-lib.ts': `export const helper = 5\n`,
        },
      },
    )
    expect(
      await route.run(
        `return [await render('component'), await render('errorComponent')]`,
      ),
    ).toEqual(['<div>home</div>', '<div>error</div>'])
    // Every module loading a split option requests: what the lazy options
    // reach beyond what loads with the route module.
    const loaded = [
      ...(await route.loadedBy('component')),
      ...(await route.loadedBy('errorComponent')),
    ]
    expect(
      loaded.map((code) => ({
        requests: dependencies(code).filter((request) =>
          ['/lib.ts', '/default-lib.ts'].includes(request),
        ),
        holdsClass: holdsMarker(code, marker),
      })),
    ).toEqual(loaded.map(() => ({ requests: [], holdsClass: false })))
    // ... while what loads with the route module (which keeps the class)
    // holds it
    expect(
      (await route.eagerModules()).some((code) => holdsMarker(code, marker)),
    ).toBe(true)
  })

  // Bug: a split option that names a binding declared by an array
  // destructuring cannot be split: the virtual compiler throws
  // "Unexpected splitNode type ☝️: VariableDeclarator".
  // Impact: a route whose component comes from an array destructuring
  // cannot be built once code splitting is on.
  test('a component declared by an array destructuring of a call shared with the errorComponent renders', async () => {
    const route = await loadRoute(
      `${head}import { createPair } from './factory'
const [Page, ErrorView] = createPair()
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: ErrorView,
})
`,
      {
        files: {
          'factory.ts': `export const createPair = () => [() => 'page', () => 'error']\n`,
        },
      },
    )
    expect(await route.run(`return render('component')`)).toBe('page')
  })
})

describe('names the code splitter generates', () => {
  /** A route file whose split options read `read` (`declaration` first). */
  const nameRoute = (read: string, declaration = '') => `${head}${declaration}
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component'], ['errorComponent']],
  loader: () => String(${read}),
  component: () => <p>{String(${read})}</p>,
  errorComponent: () => <p>{String(${read})}</p>,
})
`

  /**
   * Loads a route file that declares `declaration` (or reads `name` as a
   * global the page sets, `window` as the page's own) and whose split loader
   * and components return `name`'s value, compiled for HMR; returns what the
   * options return, and what they should return.
   */
  async function readName(name: string, declaration?: string) {
    const read = declaration?.startsWith('function') ? `${name}()` : name
    const route = await loadRoute(nameRoute(read, declaration), { hmr: true })
    return route.run<{ actual: Array<unknown>; expected: Array<unknown> }>(
      `const value = String(${declaration === undefined ? `globalThis[${JSON.stringify(name)}]` : `'value'`})
return {
  actual: [await options.loader(), await render('component'), await render('errorComponent')],
  expected: [value, '<p>' + value + '</p>', '<p>' + value + '</p>'],
}`,
      declaration === undefined && name !== 'window'
        ? { before: `globalThis[${JSON.stringify(name)}] = 'value'` }
        : {},
    )
  }

  /** The top-level bindings a served module declares (an independent parse). */
  function topLevelNames(code: string) {
    const names = new Set<string>()
    const { program } = parseSync('module.js', code, { sourceType: 'module' })
    const addPattern = (pattern: any): void => {
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
          pattern.elements.forEach(addPattern)
          break
        case 'AssignmentPattern':
          addPattern(pattern.left)
          break
        case 'RestElement':
          addPattern(pattern.argument)
          break
      }
    }
    const addStatement = (statement: any): void => {
      if (!statement) {
        return
      }
      switch (statement.type) {
        case 'ImportDeclaration':
          for (const specifier of statement.specifiers) {
            names.add(specifier.local.name)
          }
          break
        case 'VariableDeclaration':
          for (const declarator of statement.declarations) {
            addPattern(declarator.id)
          }
          break
        case 'FunctionDeclaration':
        case 'ClassDeclaration':
          if (statement.id) {
            names.add(statement.id.name)
          }
          break
        case 'ExportNamedDeclaration':
        case 'ExportDefaultDeclaration':
          addStatement(statement.declaration)
          break
      }
    }
    program.body.forEach(addStatement)
    return names
  }

  // Bug: as above, found adaptively, whatever names a compiler chooses: the
  // top-level names the modules emitted for a route file declare that the
  // same file, served untouched (an app module the router plugin does not
  // compile, through the same framework transform), does not declare, given
  // to bindings of the route file, keep their values in every split option.
  // Names of Vite's own import rewriting (`__vite__`) are the tool's.
  // Generated names: SPEC G9, §5.1.
  // Impact: a route file whose binding has a name the compiler introduces
  // cannot be built, or its options read the generated value.
  test('route file bindings named like what the compiled modules introduce keep their values', async () => {
    const code = nameRoute('userValue', `const userValue = 'value'`)
    const route = await loadRoute(code, {
      hmr: true,
      files: {
        // The same file untouched; with a component the refresh runtime
        // registers, as the compiled route module has one
        'control.tsx': `${code}export function RefreshProbe() {\n  return null\n}\n`,
      },
    })
    const { modules } = await route.modules()
    const untouched = topLevelNames(await route.transform('/control.tsx'))
    const introduced = new Set<string>()
    for (const served of Object.values(modules)) {
      for (const name of topLevelNames(served)) {
        if (!untouched.has(name) && !name.startsWith('__vite__')) {
          introduced.add(name)
        }
      }
    }
    // (A compiler that introduces no top-level name has nothing to lose.)
    const lost: Array<string> = []
    for (const name of [...introduced].sort()) {
      try {
        const { actual, expected } = await readName(
          name,
          `const ${name} = 'value'`,
        )
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          lost.push(name)
        }
      } catch {
        lost.push(name)
      }
    }
    expect(lost).toEqual([])
  })

  // The code splitter imports `lazyRouteComponent` and `lazyFn` from the
  // router package; a route file that imports them itself, for an option
  // the code splitter leaves alone, keeps working next to split options.
  test.each([
    {
      name: 'lazyRouteComponent',
      option: `pendingComponent: lazyRouteComponent(() => import('./spinner'))`,
      read: `await render('pendingComponent')`,
      expected: 'spinner',
    },
    {
      name: 'lazyFn',
      option: `loader: lazyFn(() => import('./load-data'), 'loadData')`,
      read: `await options.loader()`,
      expected: 'data',
    },
  ])(
    'a route file that imports $name from the router package keeps working next to split options',
    async ({ name, option, read, expected }) => {
      const route = await loadRoute(
        `import { createFileRoute, ${name} } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  ${option},
  component: () => <p>page</p>,
  errorComponent: () => <p>error</p>,
})
`,
        {
          files: {
            'spinner.tsx': `export default function Spinner() {\n  return 'spinner'\n}\n`,
            'load-data.ts': `export const loadData = () => 'data'\n`,
          },
        },
      )
      await expectValidModules(route)
      expect([
        await route.isLazy('component'),
        ...(await route.run<Array<unknown>>(`return [
  ${read},
  await render('component'),
  await render('errorComponent'),
]`)),
      ]).toEqual([true, expected, '<p>page</p>', '<p>error</p>'])
    },
  )
})
