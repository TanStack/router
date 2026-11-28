/**
 * Route file upkeep through full generator runs: the generator gives each
 * route file the route id of its path and the route constructor of its kind
 * (`createLazyFileRoute` for `.lazy` files, `createFileRoute` otherwise),
 * imported from the router package, and leaves everything else as the user
 * wrote it. Read back from disk and evaluated.
 *
 * What the generator may change is checked by `expectOnlyOwnedEdits`
 * (owned-edits.ts): the id argument, the constructor callee and the import
 * statements, as long as every other binding they hold stays (SPEC J1.2).
 * An unused import of the other route constructor may be removed or kept
 * (SPEC J1.2).
 */
import path from 'node:path'
import { afterEach, describe, expect, vi } from 'vitest'
import {
  diagnosticPosition,
  diagnosticsOf,
  expectDiagnostic,
  expectNoDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  captureDiagnostics,
  expectNoProblems,
} from '@tanstack/compiler-test-utils/diagnostic-channel'
import { generate, read, rootRoute } from './app'
import { expectOnlyOwnedEdits } from './owned-edits'
import { routeCallOf } from './route-id'
import { test as base } from './test'
import type { Fixtures } from './test'
import type { Config } from '../src'

afterEach(() => {
  vi.restoreAllMocks()
})

const routerPackage = '@tanstack/react-router'
const router = `'${routerPackage}'`

/**
 * What a route tree does when the real router loads it: `'loads'`, or
 * `{ fails }`, the error it fails with (a reported file the tree imports as
 * written, whose `Route` is no route).
 */
type TreeLoad = 'loads' | { fails: string }

/**
 * Runs the generator on an app with a root route, `src/routes/<file>`
 * holding `source` and `otherFiles` (paths relative to the app root), then
 * loads its route tree with the real router. The run must succeed, unless
 * `reportAllowed`: a failed run is then returned (`error`, for
 * `expectReported`). The load must go as `tree` says: a tree that loads
 * gives `routes` (route id to file), one that fails must fail with its error
 * (`routes` undefined). Returns the file as the generator left it, the
 * warnings (the load's included), `error` and `routes`.
 */
const upkeeper =
  ({ createApp, routesOf }: Pick<Fixtures, 'createApp' | 'routesOf'>) =>
  async (
    file: string,
    source: string,
    config: Partial<Config> = {},
    otherFiles: Record<string, string> = {},
    { reportAllowed = false, tree = 'loads' as TreeLoad } = {},
  ) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      [`src/routes/${file}`]: source,
      ...otherFiles,
    })
    let error: unknown
    let routes: Record<string, string | null> | undefined
    const { diagnostics } = await captureDiagnostics(async () => {
      let treeFile: string
      try {
        treeFile = (await generate(root, { disableLogging: false, ...config }))
          .generatedRouteTree
      } catch (e) {
        // (a tree expected to fail is a tree: its run must succeed)
        if (!reportAllowed || tree !== 'loads') {
          throw e
        }
        error = e
        return
      }
      if (tree === 'loads') {
        routes = await routesOf(treeFile)
      } else {
        await expect(routesOf(treeFile)).rejects.toThrow(tree.fails)
      }
    })
    return {
      root,
      file: path.join(root, 'src/routes', file),
      written: await read(root, `src/routes/${file}`),
      diagnostics,
      error,
      routes,
    }
  }

/**
 * Asserts that the generator reported the file by name: the run failed
 * naming it, or it succeeded with a warning naming it.
 */
function expectReported(
  { root, file, error, diagnostics }: Awaited<ReturnType<Upkeep>>,
  at?: { position: ReturnType<typeof diagnosticPosition> },
) {
  expectDiagnostic(error === undefined ? diagnostics : diagnosticsOf(error), {
    severity: error === undefined ? 'warning' : 'error',
    file,
    root,
    ...at,
  })
}

/**
 * Asserts the upkeep of a route file written from `source`: it evaluates
 * with the real router (a binding declared twice does not), its Route is
 * a route of the router package's kind for `createdWith`, created with
 * `createdWith` (bound to the router package export under any local name or
 * through a namespace import) and `id`, and it changed only where the
 * generator may edit it (owned-edits.ts). Returns its exports.
 */
const routeFileCheck =
  ({ evaluateModule }: Pick<Fixtures, 'evaluateModule'>) =>
  async (
    written: string,
    {
      id,
      createdWith = 'createFileRoute',
      source,
      fileName,
    }: {
      id: string
      createdWith?: 'createFileRoute' | 'createLazyFileRoute'
      source: string
      fileName?: string
    },
  ) => {
    const { exports, router: routerExports } = await evaluateModule(
      written,
      fileName,
    )
    expect(exports.Route).toBeInstanceOf(
      createdWith === 'createLazyFileRoute'
        ? routerExports.LazyRoute
        : routerExports.Route,
    )
    expect(routeCallOf(written, fileName)).toEqual({
      constructor: createdWith,
      id,
    })
    expectOnlyOwnedEdits(source, written, fileName)
    return exports
  }

type Upkeep = ReturnType<typeof upkeeper>

const test = base.extend<{
  upkeep: Upkeep
  /**
   * `upkeep` of a file the generator may report instead of keeping up, whose
   * tree goes as `tree` says.
   */
  upkeepOrReport: (
    file: string,
    source: string,
    tree: TreeLoad,
    otherFiles?: Record<string, string>,
  ) => ReturnType<Upkeep>
  expectRouteFile: ReturnType<typeof routeFileCheck>
}>({
  upkeep: ({ createApp, routesOf }, use) =>
    use(upkeeper({ createApp, routesOf })),
  upkeepOrReport: ({ upkeep }, use) =>
    use((file, source, tree, otherFiles = {}) =>
      upkeep(file, source, {}, otherFiles, { reportAllowed: true, tree }),
    ),
  expectRouteFile: ({ evaluateModule }, use) =>
    use(routeFileCheck({ evaluateModule })),
})

describe('route ids the generator fixes', () => {
  test.for([
    {
      name: 'options wrapped in `as any`',
      call: `createFileRoute('/old')({ component: Page } as any)`,
    },
    {
      name: 'options wrapped in `satisfies`',
      call: `createFileRoute('/old')({ component: Page } satisfies object)`,
    },
    {
      name: 'a double-quoted id',
      call: `createFileRoute("/old")({ component: Page })`,
    },
    // (a template literal id: replaced or reported, below)
  ])(
    'a route file with $name gets its id fixed',
    async ({ call }, { expectRouteFile, upkeep }) => {
      const source = `import { createFileRoute } from ${router}

const Page = () => null
export const Route = ${call}
`
      const { written, routes } = await upkeep('new.tsx', source)

      await expectRouteFile(written, {
        id: '/new',
        source,
      })
      expect(routes).toEqual({
        __root__: 'routes/__root.tsx',
        '/new': 'routes/new.tsx',
      })
    },
  )

  test.for([
    {
      name: 'an aliased Route export',
      body: `const NewRoute = createFileRoute('/old')({})
export { NewRoute as Route }
`,
    },
    {
      name: 'an export list of a Route declared before',
      body: `const Route = createFileRoute('/old')({})
export { Route }
`,
    },
    {
      // (one route per route file, SPEC §2.2, J2.1: the other call is an
      // ordinary function call with a path-like string argument)
      name: 'another call with a path argument before it',
      body: `const otherPath = encodeURI('/other')
export const Route = createFileRoute('/old')({})
export const other = otherPath
`,
    },
  ])(
    'a route file with $name gets the id of its Route fixed',
    async ({ body }, { expectRouteFile, upkeep }) => {
      const source = `import { createFileRoute } from ${router}\n\n${body}`
      const { written } = await upkeep('new.tsx', source)

      await expectRouteFile(written, {
        id: '/new',
        source,
      })
    },
  )

  // Source: TanStack/router#7341. In a `.ts` file, `<T>value` is a type
  // assertion and `<T>(value: T) => value` a generic arrow function, not JSX.
  test('a .ts route file with angle-bracket type assertions gets its id fixed', async ({
    expectRouteFile,
    upkeep,
  }) => {
    const source = `import { createFileRoute } from ${router}
const identity = <T>(value: T) => value
export const Route = createFileRoute('/old')({
  loader: () => <number>identity(<unknown>1),
})
`
    const { written, routes } = await upkeep('new.ts', source)

    await expectRouteFile(written, {
      id: '/new',
      source,
      fileName: 'new.ts',
    })
    expect(routes).toEqual({
      __root__: 'routes/__root.tsx',
      '/new': 'routes/new.ts',
    })
  })
})

describe('route files using the router package through a namespace import or without an id', () => {
  // SPEC J1.1, J1.2: the id is kept up whatever binding the constructor
  // is called through, and a call without an id gets it.
  test.for([
    {
      name: 'a constructor call without an id',
      file: 'new.tsx',
      source: `import { createFileRoute } from ${router}

export const Route = createFileRoute()({})
`,
      createdWith: 'createFileRoute' as const,
      // (owned edits are judged against the same file with an id: the
      // inserted id is the one owned edit)
      withId: (source: string) =>
        source.replace('createFileRoute()', "createFileRoute('/old')"),
    },
    {
      name: 'a namespace import, with another id',
      file: 'new.tsx',
      source: `import * as Router from ${router}

export const Route = Router.createFileRoute('/old')({})
`,
      createdWith: 'createFileRoute' as const,
    },
    {
      name: 'a namespace import, the lazy constructor in a route file',
      file: 'new.tsx',
      source: `import * as Router from ${router}

export const Route = Router.createLazyFileRoute('/new')({})
`,
      createdWith: 'createFileRoute' as const,
    },
    {
      name: 'a namespace import, the eager constructor in a lazy route file',
      file: 'new.lazy.tsx',
      source: `import * as Router from ${router}

export const Route = Router.createFileRoute('/old')({})
`,
      createdWith: 'createLazyFileRoute' as const,
    },
  ])(
    'a route file with $name gets its id and constructor',
    async (
      { file, source, createdWith, withId },
      { expectRouteFile, upkeep },
    ) => {
      const { written } = await upkeep(file, source)

      await expectRouteFile(written, {
        id: '/new',
        createdWith,
        source: withId ? withId(source) : source,
      })
    },
  )
})

describe('root route files', () => {
  test.for([
    {
      name: 'createRootRoute',
      source: `import { createRootRoute } from ${router}

export const Route = createRootRoute({})
`,
    },
    {
      name: 'createRootRouteWithContext',
      source: `import { createRootRouteWithContext } from ${router}

interface RouterContext {
  user?: string
}

export const Route = createRootRouteWithContext<RouterContext>()({})
`,
    },
    {
      name: 'an export list',
      source: `import { createRootRoute } from ${router}

const Route = createRootRoute()

export { Route }
`,
    },
  ])(
    'a root route file created with $name is left as it is',
    async ({ source }, { createApp, routesOf }) => {
      const root = await createApp({ 'src/routes/__root.tsx': source })
      const { generatedRouteTree } = await generate(root)

      expect(await read(root, 'src/routes/__root.tsx')).toBe(source)
      expect(await routesOf(generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
      })
    },
  )
})

describe('route constructors', () => {
  test.for([
    {
      name: 'only the lazy constructor imported',
      source: `import { createLazyFileRoute } from ${router}

export const Route = createLazyFileRoute('/new')({})
`,
    },
    {
      name: 'a semicolon-terminated import',
      source: `import { createLazyFileRoute } from ${router};

export const Route = createLazyFileRoute('/old')({});
`,
    },
    {
      name: 'a type specifier in the import',
      source: `import { type LinkProps, createLazyFileRoute } from ${router}

export type Props = LinkProps
export const Route = createLazyFileRoute('/old')({})
`,
    },
  ])(
    'a route file created with createLazyFileRoute gets createFileRoute, with $name',
    async ({ source }, { expectRouteFile, upkeep }) => {
      const { written } = await upkeep('new.tsx', source)

      // (a type import stays a type import: expectOnlyOwnedEdits)
      await expectRouteFile(written, {
        id: '/new',
        source,
      })
    },
  )

  test('a lazy route file with a multi-line import of createFileRoute gets createLazyFileRoute', async ({
    expectRouteFile,
    upkeep,
  }) => {
    const source = `import {
  Link,
  createFileRoute,
} from ${router}

export const Route = createFileRoute('/new')({
  component: () => Link,
})
`
    const { written } = await upkeep('new.lazy.tsx', source)

    await expectRouteFile(written, {
      id: '/new',
      createdWith: 'createLazyFileRoute',
      source,
    })
  })

  test.for([
    {
      name: 'no router import',
      lazy: false,
      source: `export const Route = createFileRoute('/new')({})\n`,
    },
    {
      name: 'a stale import of the other constructor',
      lazy: false,
      source: `import { createFileRoute } from ${router}
import { createLazyFileRoute } from ${router}
export const Route = createFileRoute('/new')({})
`,
    },
    {
      name: 'a stale import of the other constructor next to another import',
      lazy: false,
      source: `import { Link, createFileRoute, createLazyFileRoute } from ${router}
export const link = Link
export const Route = createFileRoute('/new')({})
`,
    },
    {
      name: 'only the other constructor imported',
      lazy: false,
      source: `import { createLazyFileRoute } from ${router}
export const Route = createFileRoute('/new')({})
`,
    },
    {
      name: 'the lazy constructor imported and createFileRoute called',
      lazy: true,
      source: `import { createLazyFileRoute } from ${router}
export const Route = createFileRoute('/new')({})
`,
    },
  ])(
    'a route file whose id is right gets the right constructor, with $name',
    async ({ lazy, source }, { expectRouteFile, upkeep }) => {
      const createdWith = lazy ? 'createLazyFileRoute' : 'createFileRoute'
      const { written } = await upkeep(
        lazy ? 'new.lazy.tsx' : 'new.tsx',
        source,
      )

      await expectRouteFile(written, {
        id: '/new',
        createdWith,
        source,
      })
    },
  )
})

// R144: a route file holding the constructor of the other kind of route
// file (a root constructor in a route file, a file route constructor in the
// root route file) is repaired to the constructor of its kind, as
// `createLazyFileRoute` in a route file is: the generator's verdict is the
// one every compiler reads, and the file a normal route of its kind.
describe('route constructors of the root and of file routes', () => {
  test.for([
    {
      name: 'createRootRoute',
      source: `import { createRootRoute } from ${router}

export const Route = createRootRoute({ component: () => 'new page' })
`,
      call: 'createRootRoute(',
    },
    {
      name: 'createRootRouteWithContext',
      source: `import { createRootRouteWithContext } from ${router}

interface RouterContext {
  user?: string
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => 'new page',
})
`,
      call: 'createRootRouteWithContext<RouterContext>()',
    },
  ])(
    'a route file created with $name gets createFileRoute with its id',
    async ({ source, call }, { expectRouteFile, upkeep }) => {
      const { written, routes } = await upkeep('new.tsx', source)

      const exports = await expectRouteFile(written, {
        id: '/new',
        // (the same file with the file route's call, as far as the
        // generator's edits go)
        source: source.replace(
          call,
          call.endsWith('(')
            ? `createFileRoute('/new')(`
            : `createFileRoute('/new')`,
        ),
      })
      expect(exports.Route.options.component()).toBe('new page')
      expect(routes).toEqual({
        __root__: 'routes/__root.tsx',
        '/new': 'routes/new.tsx',
      })
    },
  )

  test.for([
    {
      name: 'createFileRoute',
      source: `import { createFileRoute } from ${router}

export const Route = createFileRoute('/')({ component: () => 'root page' })
`,
      call: `createFileRoute('/')`,
    },
    {
      name: 'createLazyFileRoute',
      source: `import { createLazyFileRoute } from ${router}

export const Route = createLazyFileRoute('/__root')({
  component: () => 'root page',
})
`,
      call: `createLazyFileRoute('/__root')`,
    },
  ])(
    'a root route file created with $name gets createRootRoute',
    async ({ source, call }, { createApp, evaluateModule, routesOf }) => {
      const root = await createApp({ 'src/routes/__root.tsx': source })
      const { generatedRouteTree } = await generate(root)
      const written = await read(root, 'src/routes/__root.tsx')

      const { exports, router: routerExports } = await evaluateModule(written)
      expect(exports.Route).toBeInstanceOf(routerExports.RootRoute)
      expect(exports.Route.options.component()).toBe('root page')
      expect(routeCallOf(written)).toEqual({
        constructor: 'createRootRoute',
        id: undefined,
      })
      expectOnlyOwnedEdits(source.replace(call, 'createRootRoute'), written)
      expect(await routesOf(generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
      })
    },
  )
})

// A constructor of the other kind whose id is not a string literal: the
// generator gives the file the constructor of its kind (a route compiler
// waits for that repair) and reports the id it cannot keep up. Source:
// REVIEW-design5-final finding 1 (before: left with the wrong constructor
// for ever, and Start builds shipped its `server` code).
describe('a constructor of the other kind with an id that is not a string literal', () => {
  test.for([
    {
      name: 'createLazyFileRoute in a route file',
      fileName: 'new.tsx',
      from: 'createLazyFileRoute',
      to: 'createFileRoute',
    },
    {
      name: 'createFileRoute in a lazy route file',
      fileName: 'new.lazy.tsx',
      from: 'createFileRoute',
      to: 'createLazyFileRoute',
    },
  ] as const)(
    '$name gets the constructor of its kind, and its id is reported once, at its position',
    async ({ fileName, from, to }, { evaluateModule, upkeep }) => {
      const source = `import { ${from} } from ${router}

const routeId = '/new'
export const Route = ${from}(routeId)({ component: () => 'new page' })
`
      const { root, file, written, diagnostics } = await upkeep(
        fileName,
        source,
      )

      const { exports, router: routerExports } = await evaluateModule(
        written,
        fileName,
      )
      expect(exports.Route).toBeInstanceOf(
        to === 'createLazyFileRoute'
          ? routerExports.LazyRoute
          : routerExports.Route,
      )
      expect(exports.Route.options.component()).toBe('new page')
      expect(routeCallOf(written, fileName).constructor).toBe(to)
      expectOnlyOwnedEdits(source, written, fileName)
      // (once, at the id's position in the file as written: it was reported
      // at its column before the constructor's repair, a stale position,
      // and again once the repaired file was read)
      expectDiagnostic(diagnostics, {
        severity: 'warning',
        file,
        root,
        position: diagnosticPosition(written, 'routeId)'),
        times: 1,
      })
    },
  )
})

describe('missing route constructor imports', () => {
  test.for([
    {
      name: 'LF line endings',
      source: "// a\nexport const Route = createFileRoute('/old')({})\n",
    },
    {
      name: 'CRLF line endings',
      source: "// a\r\nexport const Route = createFileRoute('/old')({})\r\n",
    },
    {
      name: 'a single line',
      source: "export const Route = createFileRoute('/old')({})",
    },
    {
      name: 'an import of another package',
      source: `import { useState } from 'react'

export const state = useState
export const Route = createFileRoute('/old')({})
`,
    },
  ])(
    'a route file without the constructor import gets it, with $name',
    async ({ source }, { expectRouteFile, upkeep }) => {
      const { written } = await upkeep('new.tsx', source)

      await expectRouteFile(written, {
        id: '/new',
        source,
      })
    },
  )

  test.for([
    {
      name: 'an aliased import of the constructor',
      imports: `import { createFileRoute as cfr } from ${router}`,
      uses: 'cfr',
    },
    {
      // (both aliases of the same export stay bound; a generator that
      // dropped one passed the other cases)
      name: 'two aliases of another router export',
      imports: `import { Link as Primary, Link as Secondary } from ${router}`,
      uses: 'Primary, Secondary',
    },
    {
      // The constructor cannot join a namespace import
      // (`import * as Router, { ... }` does not parse).
      name: 'a namespace import',
      imports: `import * as Router from ${router}
import { Link } from ${router}`,
      uses: 'Router.Link, Link',
    },
    {
      name: 'a namespace import, in a file using semicolons',
      imports: `import * as Router from ${router};`,
      uses: 'Router',
    },
  ])(
    'a route file calling createFileRoute next to $name gets it bound once',
    async ({ imports, uses }, { expectRouteFile, upkeep }) => {
      const source = `${imports}
export const uses = [${uses}]
export const Route = createFileRoute('/old')({})
`
      const { written } = await upkeep('new.tsx', source)

      await expectRouteFile(written, {
        id: '/new',
        source,
      })
    },
  )

  test.for([
    {
      name: 'an inline type specifier in a declaration with the other constructor',
      source: `import { type LinkProps, createLazyFileRoute } from ${router}
import { createFileRoute } from ${router}
export type Props = LinkProps
export const Route = createFileRoute('/old')({})
`,
    },
    {
      name: 'a type-only declaration next to a missing constructor import',
      source: `import type { LinkProps } from ${router}
export type Props = LinkProps
export const Route = createFileRoute('/old')({})
`,
    },
  ])(
    'type imports stay type-only: $name',
    async ({ source }, { expectRouteFile, upkeep }) => {
      const { written } = await upkeep('new.tsx', source)

      // (expectOnlyOwnedEdits: `LinkProps` is still imported as a type)
      await expectRouteFile(written, {
        id: '/new',
        source,
      })
    },
  )
  // The added import goes after what must lead the file (a directive
  // prologue, a license comment, a JSX pragma) and before the comment of
  // the first statement, which stays with it.
  test.for([
    {
      name: 'a directive',
      source: `'use client'\nexport const Route = createFileRoute('/old')({})\n`,
      head: `'use client'\n`,
    },
    {
      name: 'a license comment',
      source: `/*! (c) the app */\nexport const Route = createFileRoute('/old')({})\n`,
      head: `/*! (c) the app */\n`,
    },
    {
      name: 'a JSX pragma',
      source: `/** @jsxImportSource preact */\nexport const Route = createFileRoute('/old')({})\n`,
      head: `/** @jsxImportSource preact */\n`,
    },
    // A TypeScript file directive applies only above the file's first
    // statement: below the added import, TypeScript ignores it (main too;
    // TS2322 / TS2304 afterwards).
    {
      name: 'a @ts-nocheck comment and an import',
      source: `// @ts-nocheck\nimport { useState } from 'react'\nexport const state = useState\nexport const Route = createFileRoute('/old')({})\n`,
      head: `// @ts-nocheck\n`,
    },
    {
      name: 'a @ts-nocheck comment and the route',
      source: `// @ts-nocheck\nexport const Route = createFileRoute('/old')({})\n`,
      head: `// @ts-nocheck\n`,
    },
    {
      name: 'a @ts-check comment and an import',
      source: `// @ts-check\nimport { useState } from 'react'\nexport const state = useState\nexport const Route = createFileRoute('/old')({})\n`,
      head: `// @ts-check\n`,
    },
    // (TypeScript reads a single-line directive in any case)
    {
      name: 'an upper-case @TS-NOCHECK comment and an import',
      source: `// @TS-NOCHECK\nimport { useState } from 'react'\nexport const state = useState\nexport const Route = createFileRoute('/old')({})\n`,
      head: `// @TS-NOCHECK\n`,
    },
    // A comment naming a directive is no directive: a suppression comment
    // stays on the statement it applies to (TS2578 and the error it
    // suppressed otherwise)
    {
      name: 'a suppression comment naming @ts-check on the first statement',
      source: `// @ts-expect-error: unlike @ts-check, this one line\nexport const count: number = 'one'\nexport const Route = createFileRoute('/old')({})\n`,
      head: '',
      attached: `// @ts-expect-error: unlike @ts-check, this one line\nexport const count`,
    },
    {
      name: 'a suppression comment naming @jsx on the first statement',
      source: `// @ts-expect-error The @jsx option does not type this value\nexport const count: number = 'one'\nexport const Route = createFileRoute('/old')({})\n`,
      head: '',
      attached: `// @ts-expect-error The @jsx option does not type this value\nexport const count`,
    },
    // (TypeScript applies a suppression across blank and comment lines)
    {
      name: 'a suppression comment and a blank line before the first statement',
      source: `// @ts-ignore\n\nexport const count: number = 'one'\nexport const Route = createFileRoute('/old')({})\n`,
      head: '',
      attached: `// @ts-ignore\n\nexport const count`,
    },
    {
      name: 'a triple-slash reference and an import',
      source: `/// <reference types="vite/client" />\nimport { useState } from 'react'\nexport const state = useState\nexport const Route = createFileRoute('/old')({})\n`,
      head: `/// <reference types="vite/client" />\n`,
    },
    {
      name: 'a directive and the doc comment of the route',
      source: `'use client'\n/** The page of the app. */\nexport const Route = createFileRoute('/old')({})\n`,
      head: `'use client'\n`,
      attached: `/** The page of the app. */\nexport const Route`,
    },
    {
      name: 'the doc comment of the route',
      source: `/** The page of the app. */\nexport const Route = createFileRoute('/old')({})\n`,
      head: '',
      attached: `/** The page of the app. */\nexport const Route`,
    },
  ])(
    'a route file starting with $name keeps it in place when it gets the constructor import',
    async ({ source, head, attached }, { expectRouteFile, upkeep }) => {
      const { written } = await upkeep('new.tsx', source)

      await expectRouteFile(written, {
        id: '/new',
        source,
      })
      expect(written.startsWith(`${head}import { createFileRoute }`)).toBe(true)
      if (attached) {
        expect(written).toContain(attached)
      }
    },
  )
  // The same directives with a blank line before the first statement: the
  // import goes below the blank line (main put it above the directive). The
  // whole file is compared: owned-edits.ts drops a blank line next to an
  // import.
  test.for([
    { name: 'a @ts-nocheck comment', directive: '// @ts-nocheck' },
    {
      name: 'a triple-slash reference',
      directive: '/// <reference types="vite/client" />',
    },
  ])(
    'a route file starting with $name and a blank line keeps it in place when it gets the constructor import',
    async ({ directive }, { upkeep }) => {
      const { written } = await upkeep(
        'new.tsx',
        `${directive}\n\nexport const Route = createFileRoute('/old')({})\n`,
      )

      expect(written).toBe(
        `${directive}\n\nimport { createFileRoute } from ${router}\nexport const Route = createFileRoute('/new')({})\n`,
      )
    },
  )
})

describe('stale imports of the other constructor', () => {
  test.for([
    {
      name: 'CRLF line endings',
      source: [
        `import { createFileRoute } from ${router}`,
        `import { createLazyFileRoute } from ${router}`,
        '',
        "export const Route = createFileRoute('/old')({})",
      ].join('\r\n'),
    },
    {
      // (BOM-free: SPEC §2.1 selects BOM-free UTF-8 sources.)
      name: 'astral characters before them and in the route call',
      source: [
        '// 😀',
        `import { createLazyFileRoute } from ${router}`,
        `import { createFileRoute } from ${router}`,
        "export const Route = createFileRoute(/* 🚀 */ '/old')({})",
      ].join('\n'),
    },
    {
      name: 'trailing whitespace and a blank line after the stale import',
      source: `import { createFileRoute } from ${router}
import { createLazyFileRoute } from ${router} \t

export const Route = createFileRoute('/old')({})`,
    },
    {
      name: 'the stale import on the line of another import',
      source: `import { createLazyFileRoute } from ${router}; import { createFileRoute } from ${router}
export const Route = createFileRoute('/old')({})`,
    },
    {
      name: 'semicolon-terminated imports',
      source: `import { Link, createLazyFileRoute } from ${router};
import { createFileRoute } from ${router};
export const Route = createFileRoute('/old')({})
export const link = Link`,
    },
    {
      name: 'an import the upkeep does not need to change',
      source: `import {Link} from ${router}
import { createFileRoute, createLazyFileRoute } from ${router}
export const link = Link
export const Route = createFileRoute('/old')({})`,
    },
    {
      name: 'an aliased import of the constructor',
      source: `import { Link, createLazyFileRoute } from ${router}
import { createFileRoute as cfr } from ${router}
export const uses = [Link, cfr]
export const Route = createFileRoute('/old')({})`,
    },
  ])(
    'a route file with $name gets its id fixed',
    async ({ source }, { expectRouteFile, upkeep }) => {
      const { written } = await upkeep('new.tsx', source)

      await expectRouteFile(written, {
        id: '/new',
        source,
      })
    },
  )
})

// Recognition is by binding, not spelling (SPEC G15): a `createFileRoute`
// the file declares itself or imports from another module is the user's,
// with its own semantics; one shadowing the router's in an inner scope is
// left alone while the file's Route is kept up. (The missing-import repair
// of a Route whose constructor is not bound at all: "missing route
// constructor imports" above.)
describe('look-alike route constructors', () => {
  /**
   * An app's own `createFileRoute`: the router's, giving every route a
   * pending component.
   */
  const factory = `import { createFileRoute as routerFileRoute } from ${router}

export const createFileRoute = (id: any) => (options: any) =>
  routerFileRoute(id)({ pendingComponent: () => 'loading', ...options })
`

  // Bug: the generator recognises route constructors by name: a route file
  // whose `createFileRoute` is the app's own (declared in the file or
  // imported from another module of the app) gets the router package's
  // instead (an import from './-factory' is rebound to the router package;
  // a declared one gets a router import next to it), and the id argument of
  // the app's call is rewritten.
  // Source: src/transform/transform.ts `isRouteConstructor` (the route call
  // is recognised by the callee's name, without its binding's provenance;
  // the factory import is then repaired as if it were missing).
  // Impact: an app wrapping the route constructor under the same name (to
  // give its routes defaults) silently loses the wrapper in that route file
  // (here: no pending component), or the file stops compiling (a binding
  // declared twice).
  test.for([
    {
      name: 'declared in the file',
      tree: 'loads' as const,
      source: `${factory.replace('export const', 'const')}
export const Route = createFileRoute('/old')({})
`,
    },
    {
      name: 'imported from another module of the app',
      tree: 'loads' as const,
      source: `import { createFileRoute } from './-factory'

export const Route = createFileRoute('/old')({})
`,
    },
  ])(
    'a createFileRoute $name keeps its meaning: the file is left as it is, or reported',
    async ({ source, tree }, { upkeepOrReport, withRouteTree }) => {
      const outcome = await upkeepOrReport('new.tsx', source, tree, {
        'src/routes/-factory.ts': factory,
      })
      const { root, written } = outcome

      expect(written).toBe(source)
      if (outcome.routes?.['/new'] === 'routes/new.tsx') {
        // (the route is the app's constructor's: with its pending component)
        await withRouteTree(
          path.join(root, 'src/routeTree.gen.ts'),
          ({ router: liveRouter }) => {
            expect(
              liveRouter.routesById['/new']!.options.pendingComponent,
            ).toBeTypeOf('function')
          },
        )
        return
      }
      expectReported(outcome)
    },
  )

  test('a createFileRoute shadowing the router one in an inner scope is left alone while the Route is kept up', async ({
    expectRouteFile,
    upkeep,
  }) => {
    const source = `import { createFileRoute } from ${router}

function localRoute() {
  const createFileRoute = (id: string) => (options: object) => ({ id, options })
  return createFileRoute('/other')({})
}
export const local = localRoute()
export const Route = createFileRoute('/old')({})
`
    const { written } = await upkeep('new.tsx', source)

    // (the inner call keeps its bytes: expectOnlyOwnedEdits)
    const exports = await expectRouteFile(written, {
      id: '/new',
      source,
    })
    expect(exports.local.id).toBe('/other')
  })
})

describe('route files the generator does not rewrite', () => {
  // The route comes from an app module (excluded from routing by its `-`
  // prefix) the generator does not keep up: the route file is left as it
  // is and its route is registered, or the file is reported by name.
  test.for([
    {
      name: 'a Route from another module',
      tree: 'loads' as const,
      source: `import { postsRoute } from './-posts-route'
export const Route = postsRoute
`,
      helper: [
        'src/routes/-posts-route.tsx',
        `import { createFileRoute } from ${router}

export const postsRoute = createFileRoute('/new')({
  component: () => 'new page',
})
`,
      ] as const,
    },
    {
      name: 'a Route made by a route factory of the app',
      tree: 'loads' as const,
      source: `import { makeRoute } from './-make-route'
export const Route = makeRoute()({ component: () => 'new page' })
`,
      helper: [
        'src/routes/-make-route.tsx',
        `import { createFileRoute } from ${router}

export const makeRoute = () => createFileRoute('/new')
`,
      ] as const,
    },
  ])(
    '$name is left as it is and registered, or reported by name',
    async (
      { source, tree, helper: [helperFile, helperSource] },
      { upkeepOrReport, withRouteTree },
    ) => {
      const outcome = await upkeepOrReport('new.tsx', source, tree, {
        [helperFile]: helperSource,
      })
      const { root, written } = outcome

      expect(written).toBe(source)
      expect(await read(root, helperFile)).toBe(helperSource)
      if (outcome.routes?.['/new'] === 'routes/new.tsx') {
        await withRouteTree(
          path.join(root, 'src/routeTree.gen.ts'),
          async ({ renderAt }) => {
            expect(await renderAt('/new')).toContain('new page')
          },
        )
        return
      }
      expectReported(outcome)
    },
  )

  // A route id that is not a string literal: replacing it with the right
  // literal (everything else as owned-edits.ts allows) and an actionable
  // diagnostic naming the file (a failed run or a warning; the file then
  // stays as it is) are both correct (SPEC J1.1).
  test.for([
    {
      name: 'a template literal id',
      tree: 'loads' as const,
      source: `import { createFileRoute } from ${router}
const Page = () => null
export const Route = createFileRoute(\`/old\`)({ component: Page })
`,
    },
    {
      name: 'an id read from a variable',
      tree: 'loads' as const,
      source: `import { createFileRoute } from ${router}
const routeId = '/old'
export const Route = createFileRoute(routeId)({})
`,
    },
    {
      name: 'an interpolated template literal id',
      tree: 'loads' as const,
      source: `import { createFileRoute } from ${router}
const x = 'old'
export const Route = createFileRoute(\`/\${x}\`)({})
`,
    },
  ])(
    'a route file with $name gets the literal id or is reported by name',
    async ({ source, tree }, { expectRouteFile, upkeepOrReport }) => {
      const outcome = await upkeepOrReport('new.tsx', source, tree)
      const { written } = outcome

      if (routeCallOf(written).id === '/new') {
        expect(outcome.error).toBeUndefined()
        await expectRouteFile(written, {
          id: '/new',
          source,
        })
        expect(outcome.routes).toEqual({
          __root__: 'routes/__root.tsx',
          '/new': 'routes/new.tsx',
        })
      } else {
        expectReported(outcome)
        expect(written).toBe(source)
      }
    },
  )

  // (a parenthesised id was reported as "not a
  // string literal" and left stale). A literal in parentheses or a
  // TypeScript assertion is a string literal: kept up, nothing reported.
  test.for([
    {
      name: 'in parentheses',
      source: `import { createFileRoute } from ${router}
export const Route = createFileRoute(('/old'))({})
`,
      kept: `createFileRoute(('/new'))({})`,
    },
    {
      name: 'in a TypeScript assertion',
      source: `import { createFileRoute } from ${router}
export const Route = createFileRoute(('/old' as const))({})
`,
      kept: `createFileRoute(('/new' as const))({})`,
    },
  ])(
    'a route id $name gets the id of its path, nothing reported',
    async ({ source, kept }, { upkeep }) => {
      const { written, routes, diagnostics } = await upkeep('new.tsx', source)
      expectNoProblems(diagnostics)
      expect(written).toBe(
        source.replace(/createFileRoute\(.*\)\(\{\}\)/, kept),
      )
      expect(routes).toEqual({
        __root__: 'routes/__root.tsx',
        '/new': 'routes/new.tsx',
      })
    },
  )

  // The stale id of a call without the options
  // call is named in parentheses too.
  test('a parenthesised stale id of a call without the options call is reported by name', async ({
    upkeepOrReport,
  }) => {
    const outcome = await upkeepOrReport(
      'new.tsx',
      `import { createFileRoute } from ${router}
export const Route = createFileRoute(('/old'))
`,
      { fails: 'Route.update is not a function' },
    )
    expectReported(outcome)
    expect(
      [...diagnosticsOf(outcome.error), ...outcome.diagnostics]
        .map((d) => d.text)
        .join('\n'),
    ).toContain('without route options')
  })

  // A template literal id is an id like a string literal: a call without the
  // options call (a save while the route is being written) is reported by
  // name and kept as written, not taken for `createFileRoute(options)` and
  // curried into ``createFileRoute('/new')(`/old`)``.
  // (a template literal is never the options, interpolated or not)
  test.for([
    {
      name: 'a template literal id',
      id: '`/old`',
      tree: { fails: 'Route.update is not a function' },
    },
    {
      name: 'an interpolated template literal id',
      id: '`/${segment}`',
      tree: { fails: 'Route.update is not a function' },
    },
  ])(
    '$name of a call without the options call is reported at the id and kept',
    async ({ id, tree }, { upkeepOrReport }) => {
      const source = `import { createFileRoute } from ${router}
const segment = 'old'
export const Route = createFileRoute(${id})
`
      const outcome = await upkeepOrReport('new.tsx', source, tree)
      expect(outcome.written).toBe(source)
      expectReported(outcome, { position: diagnosticPosition(source, id) })
    },
  )

  // Never-fail-silently controls: a Route that is not a route (the options
  // call forgotten) or whose constructor is imported as a type only (the
  // type checker rejects both) is reported by name.
  test.for([
    {
      name: 'a createFileRoute call without the options call',
      tree: { fails: 'Route.update is not a function' },
      source: `import { createFileRoute } from ${router}
export const Route = createFileRoute('/old')
`,
    },
    {
      name: 'createFileRoute imported as a type only',
      tree: { fails: 'createFileRoute is not defined' },
      source: `import type { createFileRoute } from ${router}
export const Route = createFileRoute('/old')({})
`,
    },
    {
      name: 'an aliased createFileRoute call without the options call',
      tree: { fails: 'Route.update is not a function' },
      source: `import { createFileRoute as fileRoute } from ${router}
export const Route = fileRoute('/old')
`,
    },
  ])(
    'a route file with $name is reported by name',
    async ({ source, tree }, { upkeepOrReport }) => {
      expectReported(await upkeepOrReport('new.tsx', source, tree))
    },
  )

  // R130: a route made by the app's own helper gets nothing, whatever the
  // helper is named (REVIEW-design5-final finding 3: the generator decided
  // "the router's constructor" by the callee's name).
  test('an app helper named createFileRoute called without an options call is left alone, nothing reported', async ({
    upkeep,
  }) => {
    const source = `import { createFileRoute } from './-route-helper'
export const Route = createFileRoute('/old')
`
    const { root, file, written, diagnostics } = await upkeep(
      'new.tsx',
      source,
      {},
      {
        'src/routes/-route-helper.ts': `import { createFileRoute as routerFileRoute } from ${router}
export const createFileRoute = (id: any) =>
  routerFileRoute(id)({ component: () => 'new page' })
`,
      },
    )

    expect(written).toBe(source)
    expectNoDiagnostic(diagnostics, {
      severity: ['warning', 'error'],
      file,
      root,
    })
  })

  // A malformed route call (a never-fail-silently control, not a supported
  // input: the router's types reject options passed to the constructor
  // directly, TS2345). Either the user is told which file, by a failed run
  // or by a warning (the file then stays as it is), or the call is repaired
  // into the curried call with the route's id, keeping its options.
  test.for([
    {
      name: 'options passed to createFileRoute directly',
      constructor: 'createFileRoute',
      tree: 'loads',
      source: `import { createFileRoute } from ${router}
export const Route = createFileRoute({ component: () => null })
`,
    },
    {
      name: 'options passed to createLazyFileRoute directly',
      constructor: 'createLazyFileRoute',
      tree: 'loads',
      fileName: 'new.lazy.tsx',
      source: `import { createLazyFileRoute } from ${router}
export const Route = createLazyFileRoute({ component: () => null })
`,
    },
  ] as const)(
    'a route file with $name is reported by name or repaired',
    async (
      { source, constructor, tree, fileName = 'new.tsx' },
      { expectRouteFile, upkeepOrReport },
    ) => {
      const outcome = await upkeepOrReport(fileName, source, tree)
      const { written } = outcome

      if (outcome.error === undefined && written !== source) {
        // (repaired: the same file with the curried call, as far as the
        // generator's edits go)
        const exports = await expectRouteFile(written, {
          id: '/new',
          createdWith: constructor,
          source: source.replace(
            `${constructor}({`,
            `${constructor}('/new')({`,
          ),
          fileName,
        })
        expect(exports.Route.options.component()).toBeNull()
        expect(outcome.routes).toEqual({
          __root__: 'routes/__root.tsx',
          // (a lazy-only route is created by the tree)
          '/new':
            constructor === 'createLazyFileRoute' ? null : 'routes/new.tsx',
        })
        return
      }
      expectReported(outcome)
    },
  )
})
