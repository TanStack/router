/**
 * Route file upkeep through full generator runs: the generator gives each
 * route file the route id of its path and the route constructor of its kind
 * (`createLazyFileRoute` for `.lazy` files, `createFileRoute` otherwise),
 * imported from the router package, and leaves everything else as the user
 * wrote it. Read back from disk and evaluated.
 *
 * What the generator may change is checked by `expectOnlyOwnedEdits`
 * (owned-edits.ts): the id argument, the constructor callee and the router
 * package imports, whose other bindings stay. An unused import of the other
 * route constructor may be removed or kept (coordinator ruling on audit D
 * ASK-1; SPEC J1.2), and the printing of an edited import (quotes,
 * semicolons, line) is free.
 */
import path from 'node:path'
import { parseSync } from 'vite'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { createApp, generate, read, rootRoute } from './app'
import { expectOnlyOwnedEdits } from './owned-edits'
import { routeCallOf } from './route-id'
import { evaluateModule, routesOf } from './route-tree'
import type { Config } from '../src'

afterEach(() => {
  vi.restoreAllMocks()
})

const routerPackage = '@tanstack/react-router'
const router = `'${routerPackage}'`

/**
 * Runs the generator on an app with a root route and `src/routes/<file>`
 * holding `source`. Returns the file as the generator left it, the route
 * tree's routes (route id to file) and the warnings; or the error of a run
 * that fails.
 */
async function upkeep(
  file: string,
  source: string,
  config: Partial<Config> = {},
) {
  const warnings: Array<string> = []
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    warnings.push(args.join(' '))
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    [`src/routes/${file}`]: source,
  })
  let error: Error | undefined
  let routes: Record<string, string | null> | undefined
  try {
    const { generatedRouteTree } = await generate(root, {
      disableLogging: false,
      ...config,
    })
    routes = await routesOf(generatedRouteTree)
  } catch (e) {
    error = e as Error
  }
  return {
    root,
    file: path.join(root, 'src/routes', file),
    written: await read(root, `src/routes/${file}`),
    routes,
    warnings,
    error,
  }
}

/** The local names of the values a module imports from the router package. */
function routerValueImports(code: string) {
  const { module } = parseSync('route.tsx', code)
  return module.staticImports
    .filter((statement) => statement.moduleRequest.value === routerPackage)
    .flatMap((statement) =>
      statement.entries
        .filter((entry) => !entry.isType)
        .map((entry) => entry.localName.value),
    )
}

/**
 * Asserts the upkeep of a route file written from `source`: it evaluates
 * with the real router, its Route is created with `createdWith` and `id`,
 * which it binds once from the router package, and it changed only where
 * the generator may edit it (owned-edits.ts).
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
  await evaluateModule(written, fileName)
  expect(routeCallOf(written, fileName)).toEqual({
    constructor: createdWith,
    id,
  })
  expect(
    routerValueImports(written).filter((name) => name === createdWith),
  ).toHaveLength(1)
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
    {
      name: 'a template literal id',
      call: 'createFileRoute(`/old`)({ component: Page })',
    },
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
      // (BOM-free: SPEC §2.1 selects BOM-free UTF-8 sources; a BOM is
      // characterised in tests/outside-compiler-corpus/bom.test.ts)
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

describe('route files the generator does not rewrite', () => {
  test.each([
    {
      name: 'a Route from another module',
      source: `import { postsRoute } from './-posts-route'
export const Route = postsRoute
`,
    },
    {
      name: 'a Route made by a route factory of the app',
      source: `import { makeRoute } from './-make-route'
export const Route = makeRoute()({})
`,
    },
  ])('$name is left as it is', async ({ source }) => {
    const { written } = await upkeep('new.tsx', source)

    expect(written).toBe(source)
  })

  // A route id that is not a string literal: replacing it with the right
  // literal (everything else as owned-edits.ts allows) and an actionable
  // diagnostic naming the file (a failed run or a warning; the file then
  // stays as it is) are both correct (SPEC J1.1).
  test.each([
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
      const { root, file, written, routes, warnings, error } = await upkeep(
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
        expectDiagnostic(
          [...diagnosticsOf(error), ...diagnosticsOf(warnings, 'warning')],
          { file, root },
        )
        expect(written).toBe(source)
      }
    },
  )

  // A malformed route call: the user is told which file, by a failed run or
  // by a warning (the file then stays as it is).
  test.each([
    {
      name: 'options passed to createFileRoute directly',
      source: `import { createFileRoute } from ${router}
export const Route = createFileRoute({ component: () => null })
`,
    },
    {
      name: 'options passed to createLazyFileRoute directly',
      fileName: 'new.lazy.tsx',
      source: `import { createLazyFileRoute } from ${router}
export const Route = createLazyFileRoute({ component: () => null })
`,
    },
  ])(
    'a route file with $name is reported by name',
    async ({ source, fileName = 'new.tsx' }) => {
      const { root, file, written, warnings, error } = await upkeep(
        fileName,
        source,
      )

      expectDiagnostic(
        [...diagnosticsOf(error), ...diagnosticsOf(warnings, 'warning')],
        { file, root },
      )
      if (!error) {
        expect(written).toBe(source)
      }
    },
  )
})
