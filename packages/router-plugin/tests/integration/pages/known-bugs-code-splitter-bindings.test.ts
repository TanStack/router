/**
 * Known code-splitter bugs (part 3 of known-bugs-code-splitter.test.ts):
 * groupings, route options written as methods, bindings that read `Route`,
 * options read from the environment, exported bindings
 * and TypeScript-only syntax. Each test asserts the correct behaviour for a
 * bug main had, which today's compiler fixes (a regression test,
 * oracle/KNOWN-BUGS.md).
 *
 * Every route is loaded through the public router plugin in a real Vite dev
 * server and run in a real browser page (`./route-app`); what the user is
 * told is read from the dev server's merged diagnostic channel.
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  expectNoDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectValidModules, head, loadRoute } from '../../route-app'
import type { RouteApp, RouteAppOptions } from '../../route-app'

/**
 * Whether the dev server reported (a warning on any channel: the route
 * loaded, so nothing was refused) something about the route file, naming
 * it (J2.8: an option left unsplit is reported; the wording is free). Read
 * once the page loaded the route.
 */
async function reportsNotSplit(route: RouteApp) {
  return (
    findDiagnostics(await route.diagnostics(), {
      severity: 'warning',
      file: route.url.slice(1),
      root: route.host.root,
    }).length > 0
  )
}

describe('code-split groupings', () => {
  // Bug: `codeSplitGroupings` must be written inline; a module-level
  // constant holding the groupings is refused ("You must provide an array
  // of arrays for the codeSplitGroupings").
  // Impact: groupings shared between route files through a constant cannot
  // be used.
  test('groupings declared in a module-level constant are honoured', async () => {
    const route =
      await loadRoute(`${head}const groupings: Array<Array<'loader' | 'component'>> = [
  ['loader'],
  ['component'],
]
export const Route = createFileRoute('/')({
  codeSplitGroupings: groupings,
  loader: () => 'data',
  component: () => <p>page</p>,
})
`)
    expect(
      await route.run(
        `return [await options.loader(), await render('component')]`,
      ),
    ).toEqual(['data', '<p>page</p>'])
    // The loader and the component each load on their own.
    expect(await route.groups()).toEqual([['component'], ['loader']])
  })
})

describe('route options read from the environment', () => {
  /**
   * What the route's component renders, loaded first when it is lazy;
   * `globals` runs in the page before the route module loads.
   */
  async function renderRouteComponent(
    code: string,
    options: RouteAppOptions & { globals?: string } = {},
  ) {
    const { globals, ...routeOptions } = options
    return (await loadRoute(code, routeOptions)).run(
      `return render('component')`,
      { before: globals },
    )
  }

  // Bug: a split option that is a global (no declaration in the module) or
  // an ambient `declare const` is exported from the chunk under a name the
  // chunk never declares ("Export '...' is not defined"), or the export is
  // erased with the `declare`.
  // Impact: the chunk fails to load, or the route renders no component.
  test.each([
    { name: 'an undeclared global', declaration: '' },
    {
      name: 'an ambient declare const',
      declaration: 'declare const TsrGlobalPage: () => string\n',
    },
  ])('a component read from $name renders', async ({ declaration }) => {
    expect(
      await renderRouteComponent(
        `${head}${declaration}export const Route = createFileRoute('/')({
  component: TsrGlobalPage,
})
`,
        { globals: `globalThis.TsrGlobalPage = () => 'global page'` },
      ),
    ).toBe('global page')
  })
})

describe('exported bindings', () => {
  // Bug: the "stays in the route module" warning is only reported when the code
  // splitter changes the route module. In a production build, a route whose
  // only split candidate is an exported component is left as is, so the
  // warning is never shown (route HMR changes the module in dev, which shows
  // it).
  // Impact: no diagnostic in production builds for a page that stays in the
  // entry chunk.
  test.each([
    {
      name: 'an exported function',
      declaration: `export function Page() {
  return <p>page</p>
}`,
      binding: 'Page',
    },
    {
      name: 'a default-exported function',
      declaration: `export default function Page() {
  return <p>page</p>
}`,
      binding: 'Page',
    },
    {
      name: 'a function exported as default by name',
      declaration: `function Page() {
  return <p>page</p>
}
export default Page`,
      binding: 'Page',
    },
    {
      // Source: #8504.
      name: 'a function exported as default by specifier',
      declaration: `function Page() {
  return <p>page</p>
}
export { Page as default }`,
      binding: 'Page',
    },
    {
      name: 'an exported destructuring of a call',
      declaration: `const createBits = () => ({
  component: () => <p>page</p>,
  loader: () => ({ message: 'hello' }),
})
export const { component: Page, loader } = createBits()`,
      binding: 'Page',
      options: 'loader, ',
    },
  ])(
    'an exported component ($name) that is the only split candidate is split or reported as not code-split',
    async ({ declaration, binding, options = '' }) => {
      // A host of its own: the compiler reports an unsplit option once per
      // (file, reason) and dev server, and the shared hosts' routes share
      // one file (another test's report would hide this one's)
      const route = await loadRoute(
        `${head}${declaration}
export const Route = createFileRoute('/')({ ${options}component: ${binding} })
`,
        { fresh: true },
      )
      expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
      expect({
        split: await route.isLazy('component'),
        warned: await reportsNotSplit(route),
      }).not.toEqual({ split: false, warned: false })
    },
  )

  // Bug: a split component that reads a `Route` declared with `const` and
  // exported later (`export { Route }`) gets a chunk that creates the route
  // again instead of importing it from the route module.
  // Source: real apps: route files that end with `export { Route }`
  // (rahulroy0322/RacketHub, mchar7/nohiki-monorepo); #8504
  // (code-splitter-route-options.test.ts), where it passes.
  // Impact: the split component reads a second route object, which the
  // router does not know.
  test('a split component reads the route the route module exports through export { Route }', async () => {
    const route = await loadRoute(
      `${head}const Route = createFileRoute('/')({
  component: Page,
})
function Page() {
  return <p>{Route.id}</p>
}
export { Route }
`,
    )
    // The router mounted the exported route (which sets its id): a second
    // route object has none.
    expect(await route.run(`return renderRoute()`)).toBe('<p>/</p>')
  })

  // Bug: a route whose component is a default-exported function (which
  // stays in the route module) that another split option renders cannot be
  // compiled: the code splitter throws "Duplicate declaration \"Bar\"".
  // Source: React Compiler gating/gating-test-export-default-function.js;
  // #8504 (code-splitter-imports-exports.test.ts), where it passes.
  // Impact: the route cannot be built once code splitting is on.
  // (The identity of the component is not asserted: the chunk copies a pure
  // exported binding by rule.)
  test('a split option renders the default-exported component other modules import', async () => {
    const route = await loadRoute(
      `${head}import type { ReactNode } from 'react'
import { see } from './see'
export default function Bar(props: { children?: ReactNode }) {
  return <div>{props.children}</div>
}
function NoForget(props: { noForget?: string }) {
  see(Bar)
  return <Bar>{props.noForget}</Bar>
}
export const Route = createFileRoute('/')({ component: Bar, errorComponent: NoForget })
`,
      {
        files: {
          'see.ts': `export const seen: Array<unknown> = []
export const see = (value: unknown) => seen.push(value)
`,
          // The component other modules import.
          'importer.ts': `export { default } from './route'\n`,
        },
      },
    )
    expect(
      await route.run(`const rendered = await render('errorComponent', { noForget: 'x' })
const { default: imported } = await app('importer.ts')
const { seen } = await app('see.ts')
return { rendered, seen: seen.length, imported: typeof imported }`),
    ).toEqual({ rendered: '<div>x</div>', seen: 1, imported: 'function' })
  })

  // Bug: the code splitter deletes the exported declaration of an option's
  // component from every chunk, so a split component that renders the
  // exported component of another option, which reads `Route`, renders an
  // undeclared binding ("NotFound is not defined").
  // Source: round-3 mutation testing (compilers-B, bug A).
  // Impact: the route crashes when its component renders.
  test.each([
    {
      name: 'export function',
      declaration: `export function NotFound() {
  return <i>{Route.options.staticData.label}</i>
}`,
    },
    {
      name: 'export const',
      declaration: `export const NotFound = () => <i>{Route.options.staticData.label}</i>`,
    },
  ])(
    'a split component renders the exported component of another option that reads Route ($name)',
    async ({ declaration }) => {
      const route = await loadRoute(`${head}${declaration}
export const Route = createFileRoute('/')({
  component: () => <p><NotFound /></p>,
  staticData: { label: 'nf' },
  notFoundComponent: NotFound,
})
`)
      expect(await route.run(`return render('component')`)).toBe(
        '<p><i>nf</i></p>',
      )
    },
  )

  // Bug: a default-exported function declaration that the loader and a split
  // component both call cannot be compiled: Babel throws "Duplicate
  // declaration" for it.
  // Source: round-3 mutation testing (router-utils).
  // Impact: the route cannot be built once code splitting is on.
  test('a default-exported function the loader and the split component call works on one state', async () => {
    const route = await loadRoute(
      `${head}import { init } from './state'
const store = init({ n: 0 })
export default function bump() {
  return ++store.n
}
export const Route = createFileRoute('/')({
  loader: () => bump(),
  component: () => <p>{bump()}</p>,
})
`,
      {
        files: {
          'state.ts': `export let inits = 0
export const init = <T,>(value: T) => {
  inits++
  return value
}
`,
          'importer.ts': `export { default } from './route'\n`,
        },
      },
    )
    expect(
      await route.run(`const { default: bump } = await app('importer.ts')
return [
  options.loader(),
  await render('component'),
  bump(),
  (await app('state.ts')).inits,
]`),
    ).toEqual([1, '<p>2</p>', 3, 1])
  })

  // Bug: a split loader that the route file also exports through an export
  // list (`export { load }`) loses its declaration in the route module:
  // "Export 'load' is not defined".
  // Source: round-3 mutation testing (compilers-A).
  // Impact: the route cannot be built once code splitting is on.
  test('a split loader exported through an export list keeps working', async () => {
    const route = await loadRoute(
      `${head}function load() {
  return 'data'
}
export { load }
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: load,
  component: () => <p>page</p>,
})
`,
      { files: { 'importer.ts': `export { load } from './route'\n` } },
    )
    expect(
      await route.run(`const { load } = await app('importer.ts')
return [await options.loader(), load()]`),
    ).toEqual(['data', 'data'])
  })

  /**
   * Loads a route whose errorComponent option is the exported
   * `PostErrorComponent`, written as `value`, next to another module of the
   * app that imports `PostErrorComponent` from the route file (SPEC G9,
   * J2.4: through a real importer). `withAuth` (`./with-auth`) is an identity
   * function. Returns what the route's errorComponent renders, and whether
   * the option is split or the user is told it is not (a warning naming the
   * route file and the option). A host of its own: each row reads what
   * compiling its route reports. (Which instance the chunk renders is not
   * asserted: the chunk copies a pure exported component by rule.)
   */
  async function exportedErrorComponent(value: string) {
    const route = await loadRoute(
      `${head}import { withAuth } from './with-auth'
import { see } from './see'
import { memo } from 'react'
export const Route = createFileRoute('/posts/$postId')({
  errorComponent: ${value},
  component: () => <p>post</p>,
})
export function PostErrorComponent() {
  see(PostErrorComponent)
  return <p>error</p>
}
`,
      {
        routeId: '/posts/$postId',
        fresh: true,
        files: {
          'with-auth.ts': `export const withAuth = <T,>(component: T) => component\n`,
          'see.ts': `export const seen: Array<unknown> = []
export const see = (value: unknown) => seen.push(value)
`,
          'importer.ts': `import { PostErrorComponent } from './route'
export const imported = PostErrorComponent
`,
        },
      },
    )
    const rendered = await route.run<string>(`await app('importer.ts')
return render('errorComponent')`)
    return {
      rendered,
      splitOrReported:
        (await route.isLazy('errorComponent')) ||
        (await reportsNotSplit(route)),
    }
  }

  // An exported component named by a split option, as a bare identifier or
  // in another shape (`as any`, `as typeof X`, an HOC call such as
  // `withAuth(X)` or `memo(X)`): the option renders it, and is split or
  // the user is told it is not (SPEC J2.4, J2.8). Reach: the repository's
  // examples (react and solid basic-virtual-file-based posts-detail.tsx)
  // and e2e apps write `errorComponent: PostErrorComponent as any`.
  test.each([
    'PostErrorComponent',
    'PostErrorComponent as any',
    'PostErrorComponent as typeof PostErrorComponent',
    'withAuth(PostErrorComponent)',
    'memo(PostErrorComponent)',
  ])(
    'an exported errorComponent written as `%s` renders, split or reported',
    async (value) => {
      expect(await exportedErrorComponent(value)).toEqual({
        rendered: '<p>error</p>',
        splitOrReported: true,
      })
    },
  )
})

describe('TypeScript-only syntax', () => {
  // Bug (fixed on main too, #8867): the code splitter rejected an ES
  // decorator after `export` (`export @dec class`, valid since TypeScript
  // 5.0): "Decorators must be placed before the export keyword".
  // A real bug (SPEC §2.1, G1): the syntax is valid TypeScript. The pin reads
  // the compiled module without running the page (whether a browser runs
  // the decorator syntax is not the compiler's).
  // Source: mutation testing.
  // Impact: a route file with such a class cannot be built once code
  // splitting is on.
  test('a decorator after `export` compiles', async () => {
    const route = await loadRoute(
      `${head}import { injectable } from 'tsyringe'
export @injectable() class Store {}
export const Route = createFileRoute('/')({ component: () => <div /> })
`,
      {
        // The package is written with the app (Vite's watcher reports no
        // edit under node_modules)
        fresh: true,
        files: {
          'node_modules/tsyringe/package.json': JSON.stringify({
            name: 'tsyringe',
            type: 'module',
            exports: './index.js',
          }),
          'node_modules/tsyringe/index.js': `export const injectable = () => (value) => value\n`,
        },
      },
    )
    // The route module the dev server serves is a valid module, and
    // compiling it reported no error
    await expectValidModules({ reference: await route.transform() })
    expectNoDiagnostic(problems(await route.diagnostics()), {
      severity: 'error',
      file: 'route.tsx',
      root: route.host.root,
    })
  })

  // Bug: the code splitter cannot parse a constructor parameter decorator
  // (TypeScript `experimentalDecorators`, as dependency injection libraries
  // use them) and fails the build. Source: review of #8504, which compiles
  // it.
  // Impact: a route file with such a class cannot be built once code
  // splitting is on.
  test('a class with a parameter decorator that the split component uses compiles into parseable modules', async () => {
    const route = await loadRoute(
      `${head}import { Inject } from './di'
class Service {
  constructor(@Inject() readonly dep: unknown) {}
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{String(new Service(1).dep)}</p>,
})
`,
      {
        tsconfig: { experimentalDecorators: true },
        files: {
          'di.ts': `export const Inject = () => (_target: unknown, _key: unknown, _index: number) => {}\n`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual(['data', '<p>1</p>'])
    // Compiled: nothing reported an error compiling the route, and the
    // component is split, as configured (not left in the route module)
    expectNoDiagnostic(problems(await route.diagnostics()), {
      severity: 'error',
      file: 'route.tsx',
      root: route.host.root,
    })
    expect(await route.isLazy('component')).toBe(true)
  })

  // Bug: a type-only import re-exported without `type` (`export { Settings }`,
  // which TypeScript accepts unless verbatimModuleSyntax is on) loses its
  // import in the route module and the split chunks, which keep the export
  // that the TypeScript transform can then no longer erase. The Start
  // compiler has the same bug (pin in
  // start-plugin-core/tests/known-bugs-start-compiler.test.ts).
  // Impact: the route fails to load ("Export 'Settings' is not defined").
  test.each([`import type { Settings } from './settings'`])(
    'a type-only import re-exported as `export { Settings }` is erased (%s)',
    async (importDeclaration) => {
      const route = await loadRoute(
        `${head}${importDeclaration}
export { Settings }
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})`,
        {
          files: {
            'settings.ts': `export type Settings = { theme: string }\n`,
          },
        },
      )
      await expectValidModules(route)
    },
  )
  test.each([`import { type Settings } from './settings'`])(
    'a type-only import re-exported as `export { Settings }` is erased (%s)',
    async (importDeclaration) => {
      const route = await loadRoute(
        `${head}${importDeclaration}
export { Settings }
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})`,
        {
          files: {
            'settings.ts': `export type Settings = { theme: string }\n`,
          },
        },
      )
      await expectValidModules(route)
    },
  )

  // Bug: the split chunk declares a namespace the split component reads
  // without its body. Source: #8504 (code-splitter-imports-exports.test.ts),
  // where it passes.
  // Impact: the split component throws ("Labels is not defined").
  test('a namespace the split component reads keeps its body', async () => {
    const route =
      await loadRoute(`${head}namespace Labels { export const quiet = 'quiet' }
export const Route = createFileRoute('/')({
  component: () => <p>{Labels.quiet}</p>,
})
`)
    expect(await route.run(`return render('component')`)).toBe('<p>quiet</p>')
  })

  // Bug: the split chunk prints a type assertion used as an update target
  // without its parentheses (`count as number++`), which does not parse.
  // Sources: @vitejs/plugin-rsc transform tests, typescript-eslint
  // type-assertion/increment/as-increment.js; #8504
  // (code-splitter-imports-exports.test.ts), where it passes.
  // Impact: the split component's chunk fails to compile.
  test('an asserted update operand keeps its parentheses in a split component', async () => {
    const route = await loadRoute(`${head}let count = 0
function Page() {
  ;(count as number)++
  return count
}
export const Route = createFileRoute('/')({ component: Page })
`)
    expect(await route.run(`return render('component')`)).toBe('1')
  })

  // Bug: the split chunk prints a type assertion that is the test of a
  // conditional whose branch starts with a unary minus without its
  // parentheses (`a as any ? -x : y`), which does not parse (`any ? -x`
  // reads as the start of a conditional type). The root cause is upstream:
  // @babel/generator 7.29.8 drops the parentheses (parse+generate of
  // `f = ((a) as any) ? -x : y` gives `f = a as any ? -x : y;`; no
  // workaround here; router-utils/src/ast.ts:72 `generateFromAst` prints
  // with it). The Start compiler has the same bug (pin in
  // start-plugin-core/tests/start-compiler-preserves-user-code.test.ts).
  // Source: fuzzing.
  // Impact: the split component's chunk fails to compile, so the build
  // fails.
  test('an asserted conditional test keeps its parentheses in a split component', async () => {
    const route =
      await loadRoute(`${head}function pick(flag: unknown, x: number, y: number) {
  return ((flag) as any) ? -x : y
}
function Page() {
  return <p>{pick(true, 1, 2)}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`)
    await expectValidModules(route)
    expect(await route.run(`return render('component')`)).toBe('<p>-1</p>')
  })

  // Bug: the route module prints a JSX element whose member is read without
  // its parentheses (`(<Tag />).props` becomes `<Tag />.props`), which
  // Vite's transform does not parse. The root cause is upstream:
  // @babel/generator 7.29.8 drops the parentheses (parse+generate of
  // `f = (<X a="1" />).props.a` gives `f = <X a="1" />.props.a;`; no
  // workaround here).
  // Source: review.
  // Impact: the route module fails to compile (the dev server answers 500).
  test('a JSX element read as an object keeps its parentheses in the route module', async () => {
    const route =
      await loadRoute(`${head}function Tag(props: { label: string }) {
  return <p>{props.label}</p>
}
export const Route = createFileRoute('/')({
  loader: () => (<Tag label="kept" />).props.label,
  component: () => <p>page</p>,
})
`)
    await expectValidModules(route)
    expect(await route.run(`return options.loader()`)).toBe('kept')
  })

  /**
   * Loads a route whose split component returns `expression`, checks that
   * every module the page loads for it is valid and returns what the
   * component renders.
   */
  async function renderReturned(expression: string) {
    const route = await loadRoute(`${head}function Page() {
  return ${expression}
}
export const Route = createFileRoute('/')({ component: Page })
`)
    await expectValidModules(route)
    return route.run(`return render('component')`)
  }

  test('parenthesized JSX keeps working in a split component', async () => {
    expect(await renderReturned('(<p>page</p>)')).toBe('<p>page</p>')
  })

  /** A route whose `beforeLoad` and split loader both call `helper`. */
  const sharedHelperRoute = (helper: string) => `${head}${helper}
export { helper as helperAlias }
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['component'], ['loader']],
  component: () => null,
  beforeLoad: () => helper('before'),
  loader: () => helper(42),
})`

  async function callSharedHelper(helper: string, verbatimModuleSyntax = true) {
    const route = await loadRoute(sharedHelperRoute(helper), {
      tsconfig: { verbatimModuleSyntax },
      // As another module of the app imports them.
      files: {
        'importer.ts': `export { helper, helperAlias } from './route'\n`,
      },
    })
    return route.run(`const imported = await app('importer.ts')
return [
  typeof imported.helper === 'function' && imported.helperAlias === imported.helper,
  options.beforeLoad(),
  await options.loader(),
]`)
  }

  const overloadedHelper = `export function helper(value: string): string
export function helper(value: number): number
export function helper(value: string | number) { return value }`

  // Bug: the overload signatures of a function that the route module and a
  // split chunk share stay in both modules, next to the import of the shared
  // function, and the TypeScript transform then takes them for the binding's
  // declaration and drops the import (dead-code elimination never removes
  // overload signatures). Source: #8505.
  // Impact: in a project without `verbatimModuleSyntax`, the route module
  // fails to load ("Export 'helper' is not defined").
  test('an overloaded function the route module and a split loader share keeps working', async () => {
    expect(await callSharedHelper(overloadedHelper, false)).toEqual([
      true,
      'before',
      42,
    ])
  })
})
