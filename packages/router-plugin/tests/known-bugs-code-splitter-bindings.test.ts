/**
 * Known code-splitter bugs (part 3 of known-bugs-code-splitter.test.ts):
 * groupings, route options written as methods, bindings that read `Route`,
 * options read from the environment, classic JSX pragmas, exported bindings
 * and TypeScript-only syntax. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed.
 *
 * Every route is loaded through the public router plugin in a real Vite dev
 * server and run in a real browser page (`./route-app`); what the user is
 * told is read from the dev server's merged diagnostic channel.
 */
import { parseSync } from 'vite'
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectValidModules, head, loadRoute } from './route-app'
import type { RouteApp, RouteAppOptions } from './route-app'

/**
 * Whether the dev server reported (a warning on any channel: the route
 * loaded, so nothing was refused) that the option `option` (default
 * `component`) of the route file is left unsplit, naming the file and the
 * option (J2.8; naming the binding too is fine, the wording is free). Read
 * once the page loaded the route.
 */
async function reportsNotSplit(route: RouteApp, option = 'component') {
  return (
    findDiagnostics(await route.diagnostics(), {
      severity: 'warning',
      file: route.url.slice(1),
      root: route.host.root,
      names: [option],
    }).length > 0
  )
}

describe('code-split groupings', () => {
  // Bug: `codeSplitGroupings` must be written inline; a module-level
  // constant holding the groupings is refused ("You must provide an array
  // of arrays for the codeSplitGroupings").
  // Impact: groupings shared between route files through a constant cannot
  // be used.
  test.fails(
    'groupings declared in a module-level constant are honoured',
    async () => {
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
    },
  )
})

describe('module state read by route options written as methods', () => {
  // Bug: shared bindings are computed from route options written as
  // `key: value` only, so a binding that an option written as a method
  // (kept in the route module) and a split option both read is not shared:
  // the split chunk declares its own copy.
  // Impact: the split component reads another instance of the module state
  // than the route's other options.
  test.fails(
    'module state a method option shares with a split option is created once',
    async () => {
      const route = await loadRoute(`${head}const state = { count: 0 }
export const Route = createFileRoute('/')({
  loader() {
    return ++state.count
  },
  component: () => <div>{state.count}</div>,
})
`)
      expect(
        await route.run(`return [options.loader(), await render('component')]`),
      ).toEqual([1, '<div>1</div>'])
    },
  )
})

describe('module state next to bindings that read Route', () => {
  // Bug: bindings that depend on `Route` are never shared
  // (`removeBindingsDependingOnRoute`), and a destructuring is never split
  // across modules, so a `Map` declared next to a binding that reads `Route`
  // is created by the route module and again by the chunk that reads it.
  // Source: gap S19.
  // Impact: the loader and the component use two different caches.
  test.fails(
    'a destructuring whose sibling reads Route keeps one cache for the loader and the component',
    async () => {
      const route = await loadRoute(
        `${head}import { createRouteHelpers } from './helpers'
const { cache, useTitle } = createRouteHelpers(() => Route)
export const Route = createFileRoute('/')({
  staticData: { title: 'title' },
  loader: () => {
    cache.set('k', 1)
    return cache.size
  },
  component: () => <div>{cache.size}{useTitle()}</div>,
})
`,
        {
          files: {
            'helpers.ts': `export let created = 0
export const createRouteHelpers = (getRoute: () => any) => {
  created++
  return {
    cache: new Map(),
    useTitle: () => getRoute().options.staticData.title,
  }
}
`,
          },
        },
      )
      expect(
        await route.run(`return [
  options.loader(),
  await render('component'),
  (await app('helpers.ts')).created,
]`),
      ).toEqual([1, '<div>1title</div>', 1])
    },
  )
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

  // Control for the pins below (same harness).
  test('a split component imported by the route file renders', async () => {
    expect(
      await renderRouteComponent(
        `import { Page } from './page'
${head}export const Route = createFileRoute('/')({ component: Page })
`,
        { files: { 'page.tsx': `export const Page = () => 'page'\n` } },
      ),
    ).toBe('page')
  })

  // Bug: a split option that is a global (no declaration in the module) or
  // an ambient `declare const` is exported from the chunk under a name the
  // chunk never declares ("Export '...' is not defined"), or the export is
  // erased with the `declare`.
  // Impact: the chunk fails to load, or the route renders no component.
  test.fails.each([
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

describe('classic JSX pragmas', () => {
  const pragma = `/** @jsxRuntime classic */
/** @jsx jsx */
import { jsx } from '@emotion/react'
`

  /**
   * Loads the route file, and the same file as another module of the app
   * (`untouched.tsx`: no route file, so no compiler of the router plugin
   * touches it; the project's real JSX transform and the real
   * `@emotion/react` and React compile and run it). Returns what the split
   * route's component and the untouched file's component render.
   */
  async function renderBoth(code: string) {
    const route = await loadRoute(code, {
      files: { 'untouched.tsx': code },
      prebundle: ['@emotion/react'],
    })
    return route.run<{ split: string; untouched: string }>(`
const untouched = (await app('untouched.tsx')).Route.options.component
return {
  untouched: await renderComponent(untouched),
  split: await render('component'),
}`)
  }

  // Bug: dead-code elimination does not count a classic JSX pragma
  // (`/** @jsx jsx */`) as a use of the factory it names, so a chunk whose
  // only use of the factory is its JSX drops the factory import. Same root
  // cause as the JSX pragma pins in
  // start-plugin-core/tests/known-bugs-start-compiler.test.ts and
  // known-bugs-hydrate.test.ts. (The control that the untouched file
  // renders through the factory, so that this comparison means something:
  // outside-compiler-corpus/classic-jsx-pragma-control.test.ts.)
  // Impact: the split component throws "jsx is not defined".
  test.fails(
    'a split component renders through the factory of a classic JSX pragma',
    async () => {
      const { split, untouched } =
        await renderBoth(`${pragma}${head}export const Route = createFileRoute('/')({
  component: () => <div css={{ color: 'red' }}>page</div>,
  errorComponent: () => jsx('b', null, 'error'),
})`)
      expect(split).toBe(untouched)
    },
  )

  // Bug: same root cause as above, for a chunk with only fragments (the
  // @jsxFrag factory too) and a pragma written with two spaces. Source: #8504
  // (code-splitter-pragmas.test.ts; mutation testing of the dead code
  // removal), where they pass.
  // Impact: the split component throws "jsx is not defined".
  test.fails.each([
    {
      name: 'the fragments of a chunk, with @jsxFrag',
      code: `/** @jsxRuntime classic */
/** @jsx jsx */
/** @jsxFrag Fragment */
${head}import { jsx } from '@emotion/react'
import { Fragment } from 'react'
export const Route = createFileRoute('/')({
  component: () => <><b css={{ color: 'red' }}>page</b></>,
  errorComponent: () => jsx(Fragment, null, 'error'),
})`,
    },
    {
      // Source: #8504 (mutation testing P-03).
      name: 'a pragma written with two spaces',
      code: `/** @jsxRuntime classic */
/** @jsx  jsx */
${head}import { jsx } from '@emotion/react'
export const Route = createFileRoute('/')({
  component: () => <div css={{ color: 'red' }}>page</div>,
  errorComponent: () => jsx('b', null, 'error'),
})`,
    },
  ])('a split component renders through $name', async ({ code }) => {
    const { split, untouched } = await renderBoth(code)
    expect(split).toBe(untouched)
  })

  /**
   * The application's own classic JSX factory (module `./jsx`), rendering
   * intrinsic elements as the text `tag(children)`, counting how many
   * factories were created.
   */
  const jsxModule = `export let creations = 0
const textJsx = (type: string, _props: unknown, ...children: Array<string>) =>
  \`\${type}(\${children.join('')})\`
export const createJsx = () => {
  creations++
  return textJsx
}
`

  // Bug: the shared-binding analysis does not count the JSX of a split option
  // as a read of the classic JSX factory it compiles to, so a factory that
  // the route module creates and the loader reads is not shared with the
  // split component: the chunk drops it (same root cause as the pin above),
  // and keeping it in the chunk without sharing it creates it again there.
  // Impact: the split component throws "jsx is not defined", or the route
  // module and the chunk each create their own factory.
  // Source of the `@jsx` only row: the #8504 probe (R-13; a project whose
  // JSX runtime is classic: `@vitejs/plugin-react` with `jsxRuntime:
  // 'classic'`).
  test.fails.each([
    {
      name: '@jsxRuntime classic and @jsx',
      header: '/** @jsxRuntime classic */\n/** @jsx jsx */',
      plugin: undefined,
    },
    {
      // A project whose default JSX runtime is classic (what `@jsx` alone
      // requires: the automatic transform ignores a lone `@jsx`).
      name: '@jsx only, in a classic-runtime project',
      header: '/** @jsx jsx */',
      plugin: { jsxRuntime: 'classic' },
    },
  ])(
    'a factory the route module creates and the loader reads is created once for the split component ($name)',
    async ({ header, plugin }) => {
      const route = await loadRoute(
        `${header}
${head}import { createJsx } from './jsx'
const jsx = createJsx()
export const Route = createFileRoute('/')({
  loader: () => jsx('span', null),
  component: () => <div>page</div>,
})`,
        { files: { 'jsx.ts': jsxModule }, frameworkPluginOptions: plugin },
      )
      await expectValidModules(route)
      expect(
        await route.run(`return [
  options.loader(),
  await render('component'),
  (await app('jsx.ts')).creations,
]`),
      ).toEqual(['span()', 'div(page)', 1])
    },
  )
})

describe('exported bindings', () => {
  // Bug: the "will not be code-split" warning is only reported when the code
  // splitter changes the route module. In a production build, a route whose
  // only split candidate is an exported component is left as is, so the
  // warning is never shown (route HMR changes the module in dev, which shows
  // it).
  // Impact: no diagnostic in production builds for a page that stays in the
  // entry chunk.
  test.fails.each([
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
      // Source: #8504 (lost case L4).
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
      const route = await loadRoute(`${head}${declaration}
export const Route = createFileRoute('/')({ ${options}component: ${binding} })
`)
      expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
      expect({
        split: await route.isLazy('component'),
        warned: await reportsNotSplit(route),
      }).not.toEqual({ split: false, warned: false })
    },
  )

  // In a dev server, the user is told once per file, in the terminal, which
  // option of which file stays unsplit (J2.8, J2.19): here an exported
  // component that another route of the app imports eagerly (a permitted
  // fallback). Serving the route module, its split modules and the other
  // route adds no second report.
  // Bug: the warning names the file and the exported binding (`Page`), not
  // the route option (same bug as code-splitter-imports-exports.test.ts
  // "are reported once, naming the file and the option, when not
  // code-split").
  // Source: FIX-PLAN §G.3 (F22/F40 dev row); V1 split F40.
  // Impact: the developer has to work out which option the named export is.
  test.fails(
    'a dev server reports an exported component it leaves unsplit once per file, naming the file and the option',
    async () => {
      const route = await loadRoute(
        `${head}export function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
        {
          fresh: true,
          // The dev server's own default (route HMR on)
          hmr: true,
          files: {
            'about.tsx': `${head}import { Page } from './route'
export const Route = createFileRoute('/about')({ component: () => <Page /> })
`,
          },
          pluginOptions: {
            virtualRouteConfig: {
              type: 'root',
              file: '__root.tsx',
              children: [
                { type: 'index', file: 'route.tsx' },
                { type: 'route', path: '/about', file: 'about.tsx' },
              ],
            },
          },
        },
      )
      // The page loads every module of both routes: the route module, what
      // each of its options loads, the other route.
      await route.run(`for (const option of Object.keys(options)) await trigger(option)
await renderRoute({ at: '/' })
await renderRoute({ at: '/about' })
return null`)
      expectDiagnostic(problems(await route.diagnostics()), {
        severity: 'warning',
        file: 'route.tsx',
        root: route.host.root,
        names: ['component'],
        times: 1,
      })
    },
  )

  // Bug: the entry's `useTitle` and the one the split component calls are
  // two functions: a binding that reads `Route` is never shared
  // (`removeBindingsDependingOnRoute`), so the chunk declares a copy of the
  // exported function. Importers of the route module and the route must
  // share one instance (user ruling 2026-10-17, P1): a copy in the chunk is
  // this bug even when the function holds no state. Source: gap S19.
  // Impact: code that relies on the identity of an exported hook or helper
  // (memoisation, registries, `===` checks) sees two of them.
  // (The title lives in `staticData`, typed by the documented
  // `StaticDataRouteOption` augmentation; V1 split F28.)
  test.fails(
    'an exported function that reads Route is the one the split component calls',
    async () => {
      const route = await loadRoute(
        `${head}import { see } from './see'
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    title?: string
  }
}
export function useTitle() {
  return Route.options.staticData!.title
}
function Page() {
  see(useTitle)
  return <p>{useTitle()}</p>
}
export const Route = createFileRoute('/')({
  staticData: { title: 'title' },
  component: Page,
})
`,
        {
          files: {
            'see.ts': `export const seen: Array<unknown> = []
export const see = (value: unknown) => seen.push(value)
`,
            // Another module of the app imports the hook.
            'importer.ts': `export { useTitle } from './route'\n`,
          },
        },
      )
      expect(
        await route.run(`const { useTitle } = await app('importer.ts')
const rendered = await render('component')
const { seen } = await app('see.ts')
return {
  rendered,
  imported: useTitle(),
  sameInstance: seen.length === 1 && seen[0] === useTitle,
}`),
      ).toEqual({
        rendered: '<p>title</p>',
        imported: 'title',
        sameInstance: true,
      })
    },
  )

  // Bug: a split component that reads a `Route` declared with `const` and
  // exported later (`export { Route }`) gets a chunk that creates the route
  // again instead of importing it from the route module.
  // Source: corpus-diff, route files that end with `export { Route }`
  // (rahulroy0322/RacketHub, mchar7/nohiki-monorepo); #8504
  // (code-splitter-route-options.test.ts), where it passes.
  // Impact: the split component reads a second route object, which the
  // router does not know.
  test.fails(
    'a split component reads the route the route module exports through export { Route }',
    async () => {
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
    },
  )

  // Bug: a route whose component is a default-exported function (which
  // stays in the route module) that another split option renders cannot be
  // compiled: the code splitter throws "Duplicate declaration \"Bar\"".
  // Source: React Compiler gating/gating-test-export-default-function.js;
  // #8504 (code-splitter-imports-exports.test.ts), where it passes.
  // Impact: the route cannot be built once code splitting is on.
  test.fails(
    'a split option renders the default-exported component other modules import',
    async () => {
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
return { rendered, seen: seen.length, sameInstance: seen[0] === imported }`),
      ).toEqual({ rendered: '<div>x</div>', seen: 1, sameInstance: true })
    },
  )

  // Bug: the code splitter deletes the exported declaration of an option's
  // component from every chunk, so a split component that renders the
  // exported component of another option, which reads `Route`, renders an
  // undeclared binding ("NotFound is not defined").
  // Source: round-3 mutation testing (compilers-B, bug A).
  // Impact: the route crashes when its component renders.
  test.fails.each([
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
  test.fails(
    'a default-exported function the loader and the split component call works on one state',
    async () => {
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
    },
  )

  // Bug: a split loader that the route file also exports through an export
  // list (`export { load }`) loses its declaration in the route module:
  // "Export 'load' is not defined".
  // Source: round-3 mutation testing (compilers-A).
  // Impact: the route cannot be built once code splitting is on.
  test.fails(
    'a split loader exported through an export list keeps working',
    async () => {
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
    },
  )

  /**
   * Loads a route whose errorComponent option is the exported
   * `PostErrorComponent`, written as `value`, next to another module of the
   * app that imports `PostErrorComponent` from the route file (ruling P1:
   * through a real importer). `withAuth` (`./with-auth`) is an identity
   * function. The component records the instance it runs as (`./see`).
   * Returns what the route's errorComponent renders, whether it ran as the
   * importer's instance, and whether the option is split or the user is told
   * it is not (a warning naming the route file and the option). A host of
   * its own: the control and the pin below load the same route, and each
   * reads what compiling it reports.
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
    const { rendered, sameInstance } = await route.run<{
      rendered: string
      sameInstance: boolean
    }>(`const { imported } = await app('importer.ts')
const rendered = await render('errorComponent')
const { seen } = await app('see.ts')
return { rendered, sameInstance: seen.length === 1 && seen[0] === imported }`)
    return {
      rendered,
      sameInstance,
      splitOrReported:
        (await route.isLazy('errorComponent')) ||
        (await reportsNotSplit(route, 'errorComponent')),
    }
  }

  // Control for the pin below (same harness): the bare identifier.
  test('an exported errorComponent named by the option is the instance its importers get', async () => {
    expect(await exportedErrorComponent('PostErrorComponent')).toMatchObject({
      rendered: '<p>error</p>',
      sameInstance: true,
    })
  })

  // Bug: when it leaves the exported component unsplit, the compiler's
  // warning names the file and the export (`PostErrorComponent`), never the
  // route option (J2.8: file and option). Same bug as
  // code-splitter-imports-exports.test.ts "are reported once, naming the
  // file and the option, when not code-split".
  // Source: V1 split F40.
  // Impact: the developer has to work out which option the named export is.
  test.fails(
    'an exported errorComponent named by the option is split, or reported naming the file and the option',
    async () => {
      expect(
        (await exportedErrorComponent('PostErrorComponent')).splitOrReported,
      ).toBe(true)
    },
  )

  // Bug: an exported component named by a split option is only recognised
  // as an export when the option is a bare identifier. Written in another
  // shape (`as any`, `as typeof X`, an HOC call such as `withAuth(X)` or
  // `memo(X)`), the option is split and its chunk declares its own copy of
  // the exported component, so the route renders another instance than the
  // one other modules import (and no "not code-split" warning is shown).
  // Either outcome of the bare identifier (one instance, split or unsplit
  // with a warning) is fine (ruling P1, decision D11).
  // Reach: the repository's examples (react and solid
  // basic-virtual-file-based posts-detail.tsx) and e2e apps (react, solid
  // and vue basic-file-based-code-splitting, virtual and rspack-virtual
  // routes, solid-start virtual-routes) write `errorComponent:
  // PostErrorComponent as any`; no other module imports it there, so they
  // show no symptom.
  // Source: compilers.ts:945-960 (the export check only handles a bare
  // Identifier), :572-591, the copy via :1170-1242; fuzzing (oracle mode,
  // round 2, F1).
  // Impact: code that relies on the identity of the component (`===`
  // checks, registries, memoised props) sees two of them, and the component
  // code ships twice (see the build pin below).
  test.fails.each([
    'PostErrorComponent as any',
    'PostErrorComponent as typeof PostErrorComponent',
    'withAuth(PostErrorComponent)',
    'memo(PostErrorComponent)',
  ])(
    'an exported errorComponent written as `%s` is the instance its importers get',
    async (value) => {
      expect(await exportedErrorComponent(value)).toEqual({
        rendered: '<p>error</p>',
        sameInstance: true,
        splitOrReported: true,
      })
    },
  )
})

/**
 * The runtime imports (requests, after the dev server's TypeScript
 * transform: no type-only import is left) of a module as the dev server
 * serves it.
 */
function runtimeImports(code: string) {
  const { module } = parseSync('module.js', code, { sourceType: 'module' })
  return [
    ...module.staticImports.map((entry) => entry.moduleRequest.value),
    ...module.staticExports.flatMap((entry) =>
      entry.entries.flatMap((item) =>
        item.moduleRequest ? [item.moduleRequest.value] : [],
      ),
    ),
  ]
}

describe('TypeScript-only syntax', () => {
  // Bug: the code splitter rejects an ES decorator after `export` (`export
  // @dec class`, valid since TypeScript 5.0): "Decorators must be placed
  // before the export keyword".
  // Pending ruling NEW-1 (decorator placement after `export`): the pin keeps
  // its compile-level assertion, read without running the page (whether a
  // browser runs the decorator syntax is not the compiler's).
  // Source: round-3 mutation testing (router-utils P6).
  // Impact: a route file with such a class cannot be built once code
  // splitting is on.
  test.fails('a decorator after `export` compiles', async () => {
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
    expect(
      findDiagnostics(problems(await route.diagnostics()), {
        severity: 'error',
        file: 'route.tsx',
        root: route.host.root,
      }).map((diagnostic) => diagnostic.text),
    ).toEqual([])
  })

  // Bug: the code splitter cannot parse a constructor parameter decorator
  // (TypeScript `experimentalDecorators`, as dependency injection libraries
  // use them) and fails the build. Source: the #8504 confidence campaign
  // (F-22), where #8504 compiles it.
  // Impact: a route file with such a class cannot be built once code
  // splitting is on.
  test.fails(
    'a class with a parameter decorator that the split component uses compiles into parseable modules',
    async () => {
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
      expect(
        findDiagnostics(problems(await route.diagnostics()), {
          severity: 'error',
          file: 'route.tsx',
          root: route.host.root,
        }).map((diagnostic) => diagnostic.text),
      ).toEqual([])
      expect(await route.isLazy('component')).toBe(true)
    },
  )

  // Bug: a type-only import re-exported without `type` (`export { Settings }`,
  // which TypeScript accepts unless verbatimModuleSyntax is on) loses its
  // import in the route module and the split chunks, which keep the export
  // that the TypeScript transform can then no longer erase. The Start
  // compiler has the same bug (pin in
  // start-plugin-core/tests/known-bugs-start-compiler.test.ts).
  // Impact: the route fails to load ("Export 'Settings' is not defined").
  test.fails.each([
    `import type { Settings } from './settings'`,
    `import { type Settings } from './settings'`,
  ])(
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

  // Bug: a value import that only types read (TypeScript erases it) is
  // copied into every split chunk when the types that read it stay in the
  // route module. Source: #8504 (code-splitter-imports-exports.test.ts,
  // mutation testing of the dead code removal), where it passes.
  // Impact: split chunks load modules none of their code reads, e.g.
  // server-only code typed in the loader.
  // Observed on what the page loads: every module that loading a split
  // option requests, as the dev server serves it (TypeScript erased, so a
  // runtime-neutral `import type` is gone, §5.5), must not import the module
  // (a value the project exports next to the type, so the import is valid
  // with `verbatimModuleSyntax`, which keeps it where it is written).
  test.fails.each([
    {
      name: 'the return type of the loader',
      code: `import { Framework } from './projects'
export const Route = createFileRoute('/')({
  loader: (): Framework => 'react',
  component: () => <p>index</p>,
})`,
      file: 'projects.ts',
      module: `export const Framework = { react: 'react', solid: 'solid' } as const
export type Framework = 'react' | 'solid'
`,
    },
    {
      name: 'a parameter type of a helper the loader calls',
      code: `import { Database } from './server/db'
const load = (db: Database) => db.query()
export const Route = createFileRoute('/')({
  loader: ({ context }) => load(context.db),
  component: () => <p>page</p>,
})`,
      file: 'server/db.ts',
      module: `export class Database {
  query() {
    return 'rows'
  }
}
`,
    },
  ])(
    'split chunks do not import what only $name reads',
    async ({ code, file, module }) => {
      const route = await loadRoute(`${head}${code}\n`, {
        files: { [file]: module },
      })
      const loaded = await route.run<
        Array<string>
      >(`const before = new Set(await compiled())
for (const option of Object.keys(options)) await trigger(option)
const loaded = (await compiled()).filter((request) => !before.has(request))
return Promise.all(loaded.map(served))`)
      expect(loaded.length).toBeGreaterThan(0)
      expect(
        loaded.filter((chunk) => runtimeImports(chunk).includes(`/${file}`)),
      ).toEqual([])
    },
  )

  // Bug: the split chunk declares a namespace the split component reads
  // without its body. Source: #8504 (code-splitter-imports-exports.test.ts),
  // where it passes.
  // Impact: the split component throws ("Labels is not defined").
  test.fails(
    'a namespace the split component reads keeps its body',
    async () => {
      const route =
        await loadRoute(`${head}namespace Labels { export const quiet = 'quiet' }
export const Route = createFileRoute('/')({
  component: () => <p>{Labels.quiet}</p>,
})
`)
      expect(await route.run(`return render('component')`)).toBe('<p>quiet</p>')
    },
  )

  // Bug: the split chunk prints a type assertion used as an update target
  // without its parentheses (`count as number++`), which does not parse.
  // Sources: @vitejs/plugin-rsc transform tests, typescript-eslint
  // type-assertion/increment/as-increment.js; #8504
  // (code-splitter-imports-exports.test.ts), where it passes.
  // Impact: the split component's chunk fails to compile.
  test.fails(
    'an asserted update operand keeps its parentheses in a split component',
    async () => {
      const route = await loadRoute(`${head}let count = 0
function Page() {
  ;(count as number)++
  return count
}
export const Route = createFileRoute('/')({ component: Page })
`)
      expect(await route.run(`return render('component')`)).toBe('1')
    },
  )

  // Bug: the split chunk prints a type assertion that is the test of a
  // conditional whose branch starts with a unary minus without its
  // parentheses (`a as any ? -x : y`), which does not parse (`any ? -x`
  // reads as the start of a conditional type). The root cause is upstream:
  // @babel/generator 7.29.8 drops the parentheses (parse+generate of
  // `f = ((a) as any) ? -x : y` gives `f = a as any ? -x : y;`; no
  // workaround here; router-utils/src/ast.ts:72 `generateFromAst` prints
  // with it). The Start compiler has the same bug (pin in
  // start-plugin-core/tests/start-compiler-preserves-user-code.test.ts).
  // Source: fuzzing (oracle mode, round 2).
  // Impact: the split component's chunk fails to compile, so the build
  // fails.
  test.fails(
    'an asserted conditional test keeps its parentheses in a split component',
    async () => {
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
    },
  )

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

  // Control for the overload pin below (same route, no overload signatures).
  test('a function the route module and a split loader share keeps working', async () => {
    expect(
      await callSharedHelper(
        `export function helper(value: string | number) { return value }`,
      ),
    ).toEqual([true, 'before', 42])
  })

  const overloadedHelper = `export function helper(value: string): string
export function helper(value: number): number
export function helper(value: string | number) { return value }`

  // Control for the pin below: TypeScript erasure with
  // `verbatimModuleSyntax` keeps the import of the shared function.
  test('an overloaded function the route module and a split loader share keeps working, with verbatimModuleSyntax', async () => {
    expect(await callSharedHelper(overloadedHelper)).toEqual([
      true,
      'before',
      42,
    ])
  })

  // Bug: the overload signatures of a function that the route module and a
  // split chunk share stay in both modules, next to the import of the shared
  // function, and the TypeScript transform then takes them for the binding's
  // declaration and drops the import (dead-code elimination never removes
  // overload signatures). Source: #8505.
  // Impact: in a project without `verbatimModuleSyntax`, the route module
  // fails to load ("Export 'helper' is not defined").
  test.fails(
    'an overloaded function the route module and a split loader share keeps working',
    async () => {
      expect(await callSharedHelper(overloadedHelper, false)).toEqual([
        true,
        'before',
        42,
      ])
    },
  )
})
