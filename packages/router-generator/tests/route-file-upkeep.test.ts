/**
 * Route file upkeep through full generator runs: the generator gives each
 * route file the route id of its path and the route constructor of its kind
 * (`createLazyFileRoute` for `.lazy` files, `createFileRoute` otherwise),
 * imported from the router package, and leaves everything else as the user
 * wrote it. Read back from disk and evaluated.
 *
 * What the generator may change is checked by `expectOnlyOwnedEdits`
 * (owned-edits.ts): the id argument, the constructor callee and the import
 * statements, as long as every other binding they hold stays (ruling Q10).
 * An unused import of the other route constructor may be removed or kept
 * (coordinator ruling on audit D ASK-1; SPEC J1.2).
 */
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { captureDiagnostics } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { createApp, generate, read, rootRoute } from './app'
import { expectOnlyOwnedEdits } from './owned-edits'
import { routeCallOf } from './route-id'
import { evaluateModule, routesOf, withRouteTree } from './route-tree'
import type { Config } from '../src'

afterEach(() => {
  vi.restoreAllMocks()
})

const routerPackage = '@tanstack/react-router'
const router = `'${routerPackage}'`

/**
 * Runs the generator on an app with a root route, `src/routes/<file>`
 * holding `source` and `otherFiles` (paths relative to the app root).
 * Returns the file as the generator left it, the route
 * tree's routes (route id to file) and the warnings; or the error of a run
 * that fails.
 */
async function upkeep(
  file: string,
  source: string,
  config: Partial<Config> = {},
  otherFiles: Record<string, string> = {},
) {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    [`src/routes/${file}`]: source,
    ...otherFiles,
  })
  let error: Error | undefined
  let routes: Record<string, string | null> | undefined
  const { diagnostics } = await captureDiagnostics(async () => {
    try {
      const { generatedRouteTree } = await generate(root, {
        disableLogging: false,
        ...config,
      })
      routes = await routesOf(generatedRouteTree)
    } catch (e) {
      error = e as Error
    }
  })
  return {
    root,
    file: path.join(root, 'src/routes', file),
    written: await read(root, `src/routes/${file}`),
    routes,
    diagnostics,
    error,
  }
}

/**
 * Asserts the upkeep of a route file written from `source`: it evaluates
 * with the real router (a binding declared twice does not), its Route is
 * a route of the router package's kind for `createdWith`, created with
 * `createdWith` (bound to the router package export under any local name or
 * through a namespace import) and `id`, and it changed only where the
 * generator may edit it (owned-edits.ts).
 */
async function expectRouteFile(
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
) {
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
}

describe('route ids the generator fixes', () => {
  test.each([
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
  ])('a route file with $name gets its id fixed', async ({ call }) => {
    const source = `import { createFileRoute } from ${router}

const Page = () => null
export const Route = ${call}
`
    const { written, routes } = await upkeep('new.tsx', source)

    await expectRouteFile(written, { id: '/new', source })
    expect(routes).toEqual({
      __root__: 'routes/__root.tsx',
      '/new': 'routes/new.tsx',
    })
  })

  test.each([
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
      // (one route per route file, DECISIONS 2026-10-18: the other call is
      // an ordinary function call with a path-like string argument)
      name: 'another call with a path argument before it',
      body: `const otherPath = encodeURI('/other')
export const Route = createFileRoute('/old')({})
export const other = otherPath
`,
    },
  ])(
    'a route file with $name gets the id of its Route fixed',
    async ({ body }) => {
      const source = `import { createFileRoute } from ${router}\n\n${body}`
      const { written } = await upkeep('new.tsx', source)

      await expectRouteFile(written, { id: '/new', source })
    },
  )

  // Source: TanStack/router#7341. In a `.ts` file, `<T>value` is a type
  // assertion and `<T>(value: T) => value` a generic arrow function, not JSX.
  test('a .ts route file with angle-bracket type assertions gets its id fixed', async () => {
    const source = `import { createFileRoute } from ${router}
const identity = <T>(value: T) => value
export const Route = createFileRoute('/old')({
  loader: () => <number>identity(<unknown>1),
})
`
    const { written, routes } = await upkeep('new.ts', source)

    await expectRouteFile(written, { id: '/new', source, fileName: 'new.ts' })
    expect(routes).toEqual({
      __root__: 'routes/__root.tsx',
      '/new': 'routes/new.ts',
    })
  })
})

describe('root route files', () => {
  test.each([
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
    async ({ source }) => {
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
  test.each([
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
    async ({ source }) => {
      const { written } = await upkeep('new.tsx', source)

      // (a type import stays a type import: expectOnlyOwnedEdits)
      await expectRouteFile(written, { id: '/new', source })
    },
  )

  test('a lazy route file with a multi-line import of createFileRoute gets createLazyFileRoute', async () => {
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

  test.each([
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
    async ({ lazy, source }) => {
      const createdWith = lazy ? 'createLazyFileRoute' : 'createFileRoute'
      const { written } = await upkeep(
        lazy ? 'new.lazy.tsx' : 'new.tsx',
        source,
      )

      await expectRouteFile(written, { id: '/new', createdWith, source })
    },
  )
})

describe('missing route constructor imports', () => {
  test.each([
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
    async ({ source }) => {
      const { written } = await upkeep('new.tsx', source)

      await expectRouteFile(written, { id: '/new', source })
    },
  )

  test.each([
    {
      name: 'an aliased import of the constructor',
      imports: `import { createFileRoute as cfr } from ${router}`,
      uses: 'cfr',
    },
    {
      // (both aliases of the same export stay bound; V4 round 2 escape
      // astra-r2/02 dropped one)
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
    async ({ imports, uses }) => {
      const source = `${imports}
export const uses = [${uses}]
export const Route = createFileRoute('/old')({})
`
      const { written } = await upkeep('new.tsx', source)

      await expectRouteFile(written, { id: '/new', source })
    },
  )

  test.each([
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
  ])('type imports stay type-only: $name', async ({ source }) => {
    const { written } = await upkeep('new.tsx', source)

    // (expectOnlyOwnedEdits: `LinkProps` is still imported as a type)
    await expectRouteFile(written, { id: '/new', source })
  })
})

describe('stale imports of the other constructor', () => {
  test.each([
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
  ])('a route file with $name gets its id fixed', async ({ source }) => {
    const { written } = await upkeep('new.tsx', source)

    await expectRouteFile(written, { id: '/new', source })
  })
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
  test.fails.each([
    {
      name: 'declared in the file',
      source: `${factory.replace('export const', 'const')}
export const Route = createFileRoute('/old')({})
`,
    },
    {
      name: 'imported from another module of the app',
      source: `import { createFileRoute } from './-factory'

export const Route = createFileRoute('/old')({})
`,
    },
  ])(
    'a createFileRoute $name keeps its meaning: the file is left as it is, or reported',
    async ({ source }) => {
      const { root, file, written, routes, diagnostics, error } = await upkeep(
        'new.tsx',
        source,
        {},
        { 'src/routes/-factory.ts': factory },
      )

      expect(written).toBe(source)
      if (routes?.['/new'] === 'routes/new.tsx') {
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
      expectDiagnostic([...diagnosticsOf(error), ...diagnostics], {
        severity: ['warning', 'error'],
        file,
        root,
      })
    },
  )

  test('a createFileRoute shadowing the router one in an inner scope is left alone while the Route is kept up', async () => {
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
    await expectRouteFile(written, { id: '/new', source })
    const { exports } = await evaluateModule(written)
    expect(exports.local.id).toBe('/other')
  })
})

describe('route files the generator does not rewrite', () => {
  // The route comes from an app module (excluded from routing by its `-`
  // prefix) the generator does not keep up: the route file is left as it
  // is and its route is registered, or the file is reported by name.
  test.each([
    {
      name: 'a Route from another module',
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
    async ({ source, helper: [helperFile, helperSource] }) => {
      const { root, file, written, routes, diagnostics, error } = await upkeep(
        'new.tsx',
        source,
        {},
        { [helperFile]: helperSource },
      )

      expect(written).toBe(source)
      expect(await read(root, helperFile)).toBe(helperSource)
      if (routes?.['/new'] === 'routes/new.tsx') {
        await withRouteTree(
          path.join(root, 'src/routeTree.gen.ts'),
          async ({ renderAt }) => {
            expect(await renderAt('/new')).toContain('new page')
          },
        )
        return
      }
      expectDiagnostic([...diagnosticsOf(error), ...diagnostics], {
        severity: ['warning', 'error'],
        file,
        root,
      })
    },
  )

  // A route id that is not a string literal: replacing it with the right
  // literal (everything else as owned-edits.ts allows) and an actionable
  // diagnostic naming the file (a failed run or a warning; the file then
  // stays as it is) are both correct (SPEC J1.1).
  test.each([
    {
      name: 'a template literal id',
      source: `import { createFileRoute } from ${router}
const Page = () => null
export const Route = createFileRoute(\`/old\`)({ component: Page })
`,
    },
    {
      name: 'an id read from a variable',
      source: `import { createFileRoute } from ${router}
const routeId = '/old'
export const Route = createFileRoute(routeId)({})
`,
    },
    {
      name: 'an interpolated template literal id',
      source: `import { createFileRoute } from ${router}
const x = 'old'
export const Route = createFileRoute(\`/\${x}\`)({})
`,
    },
  ])(
    'a route file with $name gets the literal id or is reported by name',
    async ({ source }) => {
      const { root, file, written, routes, diagnostics, error } = await upkeep(
        'new.tsx',
        source,
      )

      if (routeCallOf(written).id === '/new') {
        await expectRouteFile(written, { id: '/new', source })
        expect(routes).toEqual({
          __root__: 'routes/__root.tsx',
          '/new': 'routes/new.tsx',
        })
      } else {
        expectDiagnostic([...diagnosticsOf(error), ...diagnostics], {
          severity: ['warning', 'error'],
          file,
          root,
        })
        expect(written).toBe(source)
      }
    },
  )

  // A malformed route call (a never-fail-silently control, not a supported
  // input: the router's types reject options passed to the constructor
  // directly, TS2345). Either the user is told which file, by a failed run
  // or by a warning (the file then stays as it is), or the call is repaired
  // into the curried call with the route's id, keeping its options.
  test.each([
    {
      name: 'options passed to createFileRoute directly',
      constructor: 'createFileRoute',
      source: `import { createFileRoute } from ${router}
export const Route = createFileRoute({ component: () => null })
`,
    },
    {
      name: 'options passed to createLazyFileRoute directly',
      constructor: 'createLazyFileRoute',
      fileName: 'new.lazy.tsx',
      source: `import { createLazyFileRoute } from ${router}
export const Route = createLazyFileRoute({ component: () => null })
`,
    },
  ] as const)(
    'a route file with $name is reported by name or repaired',
    async ({ source, constructor, fileName = 'new.tsx' }) => {
      const { root, file, written, routes, diagnostics, error } = await upkeep(
        fileName,
        source,
      )

      if (!error && written !== source) {
        // (repaired: the same file with the curried call, as far as the
        // generator's edits go)
        await expectRouteFile(written, {
          id: '/new',
          createdWith: constructor,
          source: source.replace(
            `${constructor}({`,
            `${constructor}('/new')({`,
          ),
          fileName,
        })
        const { exports } = await evaluateModule(written, fileName)
        expect(exports.Route.options.component()).toBeNull()
        expect(routes).toEqual({
          __root__: 'routes/__root.tsx',
          // (a lazy-only route is created by the tree)
          '/new':
            constructor === 'createLazyFileRoute' ? null : 'routes/new.tsx',
        })
        return
      }
      expectDiagnostic([...diagnosticsOf(error), ...diagnostics], {
        severity: ['warning', 'error'],
        file,
        root,
      })
    },
  )
})
