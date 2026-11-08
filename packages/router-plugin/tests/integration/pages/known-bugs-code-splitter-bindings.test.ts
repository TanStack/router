/**
 * Known code-splitter bugs (part 3 of known-bugs-code-splitter.test.ts):
 * groupings, route options written as methods, bindings that read `Route`,
 * options read from the environment, classic JSX pragmas, exported bindings
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
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
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
})

describe('exported bindings', () => {
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
    expect(
      findDiagnostics(problems(await route.diagnostics()), {
        severity: 'error',
        file: 'route.tsx',
        root: route.host.root,
      }).map((diagnostic) => diagnostic.text),
    ).toEqual([])
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
})
