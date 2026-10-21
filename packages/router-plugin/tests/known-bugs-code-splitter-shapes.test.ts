/**
 * Known code-splitter bugs (route options and factories written in other
 * shapes, what split chunks hold, names the code splitter generates). Each
 * test asserts correct behaviour for a bug on main and is marked .fails;
 * remove .fails when the bug is fixed. Same harness as
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
import { expectValidModules, head, holdsMarker, loadRoute } from './route-app'
import type { RouteApp, TargetFramework } from './route-app'
import type { Plugin } from 'vite'

/**
 * The modules of the app the served module `code` depends on (static
 * imports, re-exports and dynamic imports), as the requests the dev server
 * resolved them to (`/lib.ts`): an independent parse of what the page
 * receives, for D5 checks that a split chunk does not depend on a module of
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
 * Whether the dev server warned, on any channel, naming the route file and
 * the route option `option` (default `component`) the compiler leaves
 * unsplit: the user is told which option of which file is not code-split
 * (J2.8; naming the binding too is fine, the wording is free).
 */
async function reportsNotSplit(route: RouteApp, option = 'component') {
  return (
    findDiagnostics(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
      names: [option],
    }).length > 0
  )
}

describe('route options written in other shapes', () => {
  // Bug: a route whose options object or factory call is wrapped in a
  // TypeScript cast is not split at all, and a component wrapped in
  // `satisfies` cannot be split: the virtual compiler throws
  // "Unexpected splitNode type ☝️: TSSatisfiesExpression". These are our
  // limitations, so the goal is a split
  // component (decision D11).
  // Sources: corpus-diff, openalgon-alt/agri-prep-path
  // src/routes/admin/access.tsx (`createFileRoute('/admin/access')({ … } as
  // any)`); differential fuzzing (casts around the route factory call);
  // React Router route-chunks-test.ts "chunkable" detection of export
  // values; #8504 (code-splitter-route-options.test.ts), where they pass.
  // Impact: the component loads with the entry chunk, or the route cannot
  // be built once code splitting is on.
  test.fails.each([
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
    {
      name: 'the component wrapped in a satisfies expression',
      route: `createFileRoute('/')({ component: Page satisfies (() => unknown) })`,
    },
  ])('a component is split with $name', async ({ route }) => {
    const loaded = await loadRoute(`${head}export const Route = ${route}
function Page() {
  return <p>page</p>
}
`)
    expect(await loaded.isLazy('component')).toBe(true)
    expect(await loaded.run(`return render('component')`)).toBe('<p>page</p>')
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

  // Bug: the virtual compiler accepts only a fixed list of expression types
  // for the value of a split option; any other expression the route module
  // splits makes the build throw "Unexpected splitNode type ☝️:
  // MemberExpression" (LogicalExpression, TaggedTemplateExpression,
  // ClassExpression). These are our limitations, so the goal is a split
  // option (decision D11).
  // Source: round-3 mutation testing (compilers-B, bug B).
  // Impact: a route whose component is a namespace member (`Pages.Home`), a
  // fallback (`A ?? B`), a styled-components tagged template or a class
  // cannot be built once code splitting is on.
  test.fails.each<{
    name: string
    option?: string
    value: string
    declarations?: string
    filename?: string
    expected: unknown
  }>([
    {
      name: 'a member of a namespace import',
      value: 'Pages.Home',
      expected: 'home',
    },
    {
      name: 'a member of a local object (loader)',
      option: 'loader',
      value: 'api.load',
      expected: 'data',
    },
    {
      name: 'a logical fallback',
      declarations: `const overrides: { Home?: () => string } = {}\n`,
      value: 'overrides.Home || Fallback',
      expected: 'fallback',
    },
    {
      name: 'a nullish fallback',
      declarations: `const overrides: { Home?: () => string } = {}\n`,
      value: 'overrides.Home ?? Fallback',
      expected: 'fallback',
    },
    {
      name: 'a tagged template',
      value: 'styled`home`',
      expected: 'styled home',
    },
    {
      // JavaScript: the route types of React accept function components
      // only (TS2322 for a class).
      name: 'a class expression',
      filename: 'route.jsx',
      declarations: `import { Component } from 'react'\n`,
      value: `class extends Component {
    render() {
      return <p>class</p>
    }
  }`,
      expected: '<p>class</p>',
    },
  ])(
    'an option written as $name is split and works',
    async ({
      option = 'component',
      value,
      declarations = '',
      filename,
      expected,
    }) => {
      const route = await loadRoute(
        `${head}import * as Pages from './pages'
import { styled } from './styled'
${declarations}const Fallback = () => 'fallback'
const api = { load: () => 'data' }
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: ${option === 'loader' ? value : `() => 'data'`},
  component: ${option === 'component' ? value : `() => <p>page</p>`},
})
`,
        {
          filename,
          files: {
            'pages.ts': `export const Home = () => 'home'\n`,
            'styled.ts': `export const styled = (strings: TemplateStringsArray) => () =>
  \`styled \${strings[0]}\`
`,
          },
        },
      )
      expect(await route.isLazy(option)).toBe(true)
      expect(
        await route.run(
          option === 'loader'
            ? `return (await load('loader'))()`
            : `return render(${JSON.stringify(option)})`,
        ),
      ).toBe(expected)
    },
  )

  // Bug: a component option written as a call cannot be split when its
  // printed code does not parse on its own with Babel's default options: the
  // virtual compiler prints the call and parses it again as a script
  // statement, without JSX ("Support for the experimental syntax 'jsx' isn't
  // currently enabled") and without TypeScript ("Unexpected token"). A type
  // argument (`memo<Props>(Page)`) even parses, as comparisons, and the
  // option silently becomes `false`.
  // Source: compilers.ts:1081-1082 (`babel.parse(outputSplitNodeCode)`).
  // Sources: differential fuzzing; dev servers of the e2e apps, where the
  // `?tsr-split=component` module failed with HTTP 500; #8504
  // (code-splitter-jsx.test.ts), where the JSX rows pass; fuzzing (oracle
  // mode, V3) for the TypeScript rows.
  // Impact: the route cannot be built once code splitting is on, or renders
  // a value that is not its component.
  test.fails.each<{
    name: string
    component: string
    rendered?: string
    imports?: string
    targetFramework?: TargetFramework
  }>([
    {
      name: 'memo of an inline arrow',
      component: `memo(() => <p>page</p>)`,
    },
    {
      name: 'memo of an inline named function',
      component: `memo(function Page() {\n  return <p>page</p>\n})`,
    },
    {
      name: 'a call with a JSX argument',
      imports: `${head}import { withFallback } from './hoc'\nimport { Page } from './page'`,
      component: `withFallback(Page, <p>loading</p>)`,
      rendered: 'page',
    },
    {
      name: 'a Vue defineComponent with a render function',
      targetFramework: 'vue',
      imports: `import { createFileRoute } from '@tanstack/vue-router'
import { defineComponent } from 'vue'`,
      component: `defineComponent({\n  setup: () => () => <p>page</p>,\n})`,
    },
    {
      name: 'a call of a typed arrow function',
      component: `memo((): string => 'page')`,
      rendered: 'page',
    },
    {
      name: 'a call with a type assertion',
      imports: `${head}import { memo } from 'react'\nimport { Page } from './page'`,
      component: `memo(Page as any)`,
      rendered: 'page',
    },
    {
      name: 'a call with a type argument',
      imports: `${head}import { memo } from 'react'\nimport { Page } from './page'`,
      component: `memo<typeof Page>(Page)`,
      rendered: 'page',
    },
  ])(
    'a component written as $name is split and renders',
    async ({
      imports = `${head}import { memo } from 'react'`,
      component,
      rendered = '<p>page</p>',
      targetFramework,
    }) => {
      const route = await loadRoute(
        `${imports}
export const Route = createFileRoute('/')({ component: ${component} })
`,
        {
          targetFramework,
          files: {
            'hoc.ts': `export const withFallback = (component: unknown, _fallback: unknown) => component\n`,
            'page.ts': `export const Page = () => 'page'\n`,
          },
        },
      )
      expect(await route.isLazy('component')).toBe(true)
      expect(await route.run(`return render('component')`)).toBe(rendered)
    },
  )
})

describe('route factories written in other shapes', () => {
  // Bug: the code splitter only recognises `createFileRoute` under its own
  // name, so a route whose factory is imported under an alias is not split,
  // and nothing says so. Our limitation, so the goal is a split component
  // (decision D11). Source: the #8504 confidence campaign (K-21b, DX-02).
  // Impact: the route's components load with the entry chunk, silently.
  test.fails(
    'a component is split when createFileRoute is imported under an alias',
    async () => {
      const route =
        await loadRoute(`import { createFileRoute as fileRoute } from '@tanstack/react-router'
export const Route = fileRoute('/')({ component: Page })
function Page() {
  return <p>page</p>
}
`)
      expect(await route.isLazy('component')).toBe(true)
      expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
    },
  )

  // Bug: the code splitter only compiles files whose code matches
  // `createFileRoute(`, so a route whose factory call has a type argument
  // (`createFileRoute<'/'>('/')`) is left as is, and nothing says so. Our
  // limitation, so the goal is a split component (decision D11).
  // Source: round-3 mutation testing (splitter-hosts X1).
  // Impact: the route's components load with the entry chunk, silently.
  test.fails(
    'a component is split when createFileRoute has a type argument',
    async () => {
      const route = await loadRoute(`${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute<'/'>('/')({ component: Page })
`)
      expect(await route.isLazy('component')).toBe(true)
      expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
    },
  )

  // Bug: route options returned by a call (`createFileRoute('/')(
  // makeOptions())`) are neither split nor reported. The user can write the
  // options inline, so a warning naming the file is an acceptable outcome
  // (decision D11). Source: the #8504 confidence campaign (DX-02, RF-8).
  // Impact: the route's components load with the entry chunk, silently.
  test.fails(
    'route options returned by a call are split or reported',
    async () => {
      const route = await loadRoute(`${head}function Page() {
  return <p>page</p>
}
const makeOptions = () => ({ component: Page })
export const Route = createFileRoute('/')(makeOptions())
`)
      expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
      expect({
        split: await route.isLazy('component'),
        warned: await reportsNotSplit(route),
      }).not.toEqual({ split: false, warned: false })
    },
  )

  // Bug: a route file that creates two file routes compiles both routes'
  // split options into the same chunk names, so one route renders the
  // other's component, silently. Supporting it, or refusing it with an error
  // or a warning naming the file, are both valid fixes.
  // Source: the #8504 confidence campaign (corpus-diff K-01; the #8630 pin
  // was dropped without a ruling).
  // Impact: a route renders another route's component.
  test.fails(
    'each of two file routes of one module renders its own component, or the module is reported',
    async () => {
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
    },
  )
})

describe('what split chunks hold', () => {
  // Bug: a split chunk keeps every exported `function`, `class` and
  // `export default function` declaration of the route file, with the
  // imports they use, whether its option reads them or not
  // (`compilers.ts`, the virtual compiler keeps exported declarations).
  // Bundlers cannot drop them: the chunk is imported with `import()` and read
  // through a computed key. Source: decision D5.
  // Impact: every split chunk of the route downloads and evaluates the route
  // file's exported helpers and their dependencies again.
  test.fails(
    'a split chunk holds only what its option needs, not the other exports of the route file',
    async () => {
      // Each exported declaration carries a marker its code keeps under any
      // name a compiler gives it (SPEC J2.5 D5: identified independently of
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
    },
  )

  // Bug: same root cause as above, for re-exports and a default-exported
  // class: every split chunk re-exports them or declares the class again.
  // Source: Next.js ssg/getStaticProps/should-remove-extra-named-export-speicifers,
  // should-support-full-re-export and should-support-class-exports; #8504
  // (code-splitter-imports-exports.test.ts), where it passes.
  // Impact: every split chunk loads the re-exported modules and the class.
  test.fails(
    'split chunks do not re-export or declare the re-exports and default class of the route file',
    async () => {
      // The class carries a marker its code keeps under any name a
      // compiler gives the class (SPEC J2.5 D5: identified independently
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
    },
  )

  /**
   * A route app whose dependency optimizer also pre-bundles `@emotion/react`
   * (a CommonJS-dependent package the page imports), as a user's Vite config
   * does with `optimizeDeps.include`.
   */
  const emotionDeps: Plugin = {
    name: 'test:app-optimize-emotion',
    config: () => ({
      optimizeDeps: {
        include: ['@emotion/react', '@emotion/react/jsx-runtime'],
      },
    }),
  }

  /**
   * Renders the route file's component as the route renders it, and as the
   * same file renders it untouched (an app module the router plugin does not
   * compile, `untouched.tsx`); with whether `library` loads with the route
   * module, read before anything else imports it.
   */
  async function loadPragmaRoute(code: string, library: string) {
    const route = await loadRoute(code, {
      plugins: { before: [emotionDeps] },
      files: { 'untouched.tsx': code },
    })
    const observed = await route.run<{
      rendered: string
      untouched: string
      libraryLoadsEagerly: boolean
    }>(`// The library's module as the dependency optimizer serves it
const library = ${JSON.stringify(library)}
const libraryLoaded = () => performance.getEntriesByType('resource').some((entry) =>
  new URL(entry.name).pathname.startsWith('/node_modules/.vite/deps/' + library.replace('/', '_') + '.js'))
const libraryLoadsEagerly = libraryLoaded()
const rendered = await render('component')
const untouched = await renderComponent((await app('untouched.tsx')).Route.options.component)
return { rendered, untouched, libraryLoadsEagerly }`)
    return { route, ...observed }
  }

  // Bug: the route module keeps importing the classic JSX factory its pragma
  // names after the JSX that compiles to it moved to a split chunk (D5
  // family). Source: #8504 (code-splitter-pragmas.test.ts; mutation testing
  // P-03), where it passes.
  // Impact: the entry chunk loads the JSX library for nothing.
  // The factory is the real one (`@emotion/react`'s `jsx`), rendered by the
  // real React: the split component renders as the untouched file renders
  // it.
  test.fails.each([
    {
      name: '@jsx',
      header: `/** @jsxRuntime classic */
/** @jsx jsx */
import { jsx } from '@emotion/react'`,
    },
    {
      name: '@jsx written with two spaces',
      header: `/** @jsxRuntime classic */
/** @jsx  jsx */
import { jsx } from '@emotion/react'`,
    },
  ])(
    'a module without JSX does not import the classic factory ($name)',
    async ({ header }) => {
      const code = `${header}
${head}export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p css={{ color: 'red' }}>page</p>,
})
`
      // Without JSX left, the route module needs nothing of the library (nor
      // does what loads with it).
      const { rendered, untouched, libraryLoadsEagerly } =
        await loadPragmaRoute(code, '@emotion/react')
      expect({ rendered, libraryLoadsEagerly }).toEqual({
        rendered: untouched,
        libraryLoadsEagerly: false,
      })
    },
  )

  // The `@jsxFrag` row of the pin above, without its import check: a chunk
  // that keeps an unused `Fragment` specifier on the import of `react` it
  // needs anyway pulls in no unrelated dependency (SYNTHESIS N10: an unused
  // specifier is free, §5.9), so what remains to check is that the split
  // component renders as the untouched file renders it, with `@jsx` and
  // `@jsxFrag` pragmas naming React's real factories.
  test('a split component of a file with @jsx and @jsxFrag pragmas renders as the untouched file', async () => {
    const code = `/** @jsxRuntime classic */
/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment } from 'react'
${head}export const Route = createFileRoute('/')({
  loader: () => <>{1}</>,
  component: () => <p>page</p>,
})
`
    const { rendered, untouched } = await loadPragmaRoute(code, 'react')
    expect(rendered).toBe(untouched)
    expect(rendered).toBe('<p>page</p>')
  })

  // Control for the array destructuring pins below: a component declared by
  // an object destructuring of a literal is split and renders.
  test('a component declared by an object destructuring renders', async () => {
    const route =
      await loadRoute(`${head}const { Page } = { Page: () => <div>page</div> }
export const Route = createFileRoute('/')({ component: Page })
`)
    expect(await route.run(`return render('component')`)).toBe(
      '<div>page</div>',
    )
  })

  // Bug: a split option that names a binding declared by an array
  // destructuring cannot be split: the virtual compiler throws
  // "Unexpected splitNode type ☝️: VariableDeclarator".
  // Impact: a route whose component comes from an array destructuring
  // cannot be built once code splitting is on.
  test.fails(
    'a component declared by an array destructuring of a call shared with the errorComponent renders',
    async () => {
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
    },
  )
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

  async function expectNameKeepsValue(name: string, declaration?: string) {
    const { actual, expected } = await readName(name, declaration)
    expect(actual).toEqual(expected)
  }

  // Control for the pins below.
  test.each([
    { name: 'TSRComponent', declaration: `const TSRComponent = 'value'` },
    { name: 'window' },
  ])(
    'a route file binding or global named $name keeps its value',
    async ({ name, declaration }) => {
      await expectNameKeepsValue(name, declaration)
    },
  )

  // Bug: the code splitter declares fixed names in the modules it emits
  // (`SplitComponent`, `SplitLoader`) without checking that the route file
  // does not use them. Source: gap S38.
  // Impact: a route file with such a binding cannot be built ("Duplicate
  // declaration") or its options read the generated value instead of the
  // user's.
  // These two inputs only discriminate today's names; the adaptive pin
  // below challenges whatever names a compiler introduces.
  test.fails.each([
    { name: 'SplitComponent', declaration: `const SplitComponent = 'value'` },
    { name: 'SplitLoader', declaration: `const SplitLoader = 'value'` },
  ])(
    'a route file binding named $name keeps its value',
    async ({ name, declaration }) => {
      await expectNameKeepsValue(name, declaration)
    },
  )

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
  // Source: gap S38, R3 (generated names) of the coupling audit.
  // Impact: a route file whose binding has a name the compiler introduces
  // cannot be built, or its options read the generated value.
  test.fails(
    'route file bindings named like what the compiled modules introduce keep their values',
    async () => {
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
    },
  )

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
