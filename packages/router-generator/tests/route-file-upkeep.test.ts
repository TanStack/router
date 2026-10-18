/**
 * Route file upkeep through full generator runs: the generator gives each
 * route file the route id of its path and the route constructor of its kind
 * (`createLazyFileRoute` for `.lazy` files, `createFileRoute` otherwise),
 * imported from the router package, and leaves everything else as the user
 * wrote it. Read back from disk and evaluated.
 *
 * An unused import of the other route constructor may be removed or kept
 * (coordinator ruling on audit D ASK-1): tests accept either, and always
 * check that the file evaluates, has the right id, binds the right
 * constructor once and keeps its code outside the imports.
 */
import { parseSync } from 'vite'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createApp, generate, read, rootRoute } from './app'
import { evaluateRouteFile } from './route-id'
import { routesOf } from './route-tree'
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
 * The module without its BOM and its import declarations, and without the
 * lines that held nothing but import declarations.
 */
function withoutImports(code: string) {
  const source = code.replace(/^\uFEFF/, '')
  const { program } = parseSync('route.tsx', source)
  const removed = '\u0000'
  let marked = ''
  let last = 0
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      marked += source.slice(last, statement.start) + removed
      last = statement.end
    }
  }
  marked += source.slice(last)
  return marked
    .split(/(?<=\n)/)
    .filter(
      (line) => !(line.includes(removed) && line.replaceAll(removed, '').trim() === ''),
    )
    .map((line) => line.replaceAll(removed, ''))
    .join('')
}

/**
 * Asserts the upkeep of a route file: it evaluates (with the router exports
 * it uses) to a Route with `id` created with `createdWith`, which it binds
 * once from the router package, and its code outside the imports is
 * `expected`'s.
 */
async function expectRouteFile(
  written: string,
  {
    id,
    createdWith = 'createFileRoute',
    expected,
    routerExports = [],
  }: {
    id: string
    createdWith?: 'createFileRoute' | 'createLazyFileRoute'
    expected: string
    routerExports?: Array<string>
  },
) {
  const { Route } = await evaluateRouteFile(written, routerExports)
  expect([Route.id, Route.createdWith]).toEqual([id, createdWith])
  expect(
    routerValueImports(written).filter((name) => name === createdWith),
  ).toHaveLength(1)
  expect(withoutImports(written)).toBe(withoutImports(expected))
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

    await expectRouteFile(written, {
      id: '/new',
      expected: source.replace('/old', '/new'),
    })
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
      name: 'another, not exported route call',
      body: `const OtherRoute = createFileRoute('/other')({})
export const Route = createFileRoute('/old')({})
export const other = OtherRoute
`,
    },
  ])('a route file with $name gets the id of its Route fixed', async ({ body }) => {
    const source = `import { createFileRoute } from ${router}\n\n${body}`
    const { written } = await upkeep('new.tsx', source)

    await expectRouteFile(written, {
      id: '/new',
      expected: source.replace('/old', '/new'),
    })
  })

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

    expect(written).toBe(source.replace('/old', '/new'))
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
  ])('a root route file created with $name is left as it is', async ({ source }) => {
    const root = await createApp({ 'src/routes/__root.tsx': source })
    const { generatedRouteTree } = await generate(root)

    expect(await read(root, 'src/routes/__root.tsx')).toBe(source)
    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
    })
  })
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
  ])('a route file created with createLazyFileRoute gets createFileRoute, with $name', async ({ source }) => {
    const { written } = await upkeep('new.tsx', source)

    await expectRouteFile(written, {
      id: '/new',
      expected: source
        .replace('/old', '/new')
        .replace('createLazyFileRoute(', 'createFileRoute('),
    })
    // An import declaration keeps its semicolon (or lack of one).
    const routerImports = written
      .split(/\r?\n/)
      .filter((line) => line.startsWith('import ') && line.includes(router))
    for (const line of routerImports) {
      expect(line.endsWith(';')).toBe(source.includes(`${router};`))
    }
    // A type import stays a type import.
    expect(routerValueImports(written)).not.toContain('LinkProps')
  })

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
      expected: source.replace('createFileRoute(', 'createLazyFileRoute('),
      routerExports: ['Link'],
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
  ])('a route file whose id is right gets the right constructor, with $name', async ({ lazy, source }) => {
    const createdWith = lazy ? 'createLazyFileRoute' : 'createFileRoute'
    const { written } = await upkeep(lazy ? 'new.lazy.tsx' : 'new.tsx', source)

    await expectRouteFile(written, {
      id: '/new',
      createdWith,
      expected: lazy
        ? source.replace('createFileRoute(', 'createLazyFileRoute(')
        : source,
      routerExports: ['Link'],
    })
  })
})

describe('missing route constructor imports', () => {
  test.each([
    {
      name: 'LF line endings',
      newline: '\n',
      lines: ['// a', "export const Route = createFileRoute('/old')({})", ''],
    },
    {
      name: 'CRLF line endings',
      newline: '\r\n',
      lines: ['// a', "export const Route = createFileRoute('/old')({})", ''],
    },
    {
      name: 'a single line',
      newline: '\n',
      lines: ["export const Route = createFileRoute('/old')({})"],
    },
    {
      name: 'an import of another package',
      newline: '\n',
      lines: [
        "import { useState } from 'react'",
        '',
        "export const Route = createFileRoute('/old')({})",
        '',
      ],
    },
  ])('a route file without the constructor import gets it on its own line, with $name', async ({ newline, lines }) => {
    const source = lines.join(newline)
    const { written } = await upkeep('new.tsx', source)

    const other = newline === '\n' ? '\r\n' : '\n'
    const outputLines = written.split(newline)
    expect(outputLines.filter((line) => !line.startsWith('import '))).toEqual(
      lines
        .filter((line) => !line.startsWith('import '))
        .map((line) => line.replace('/old', '/new')),
    )
    // No other line ending is mixed in.
    expect(
      other === '\n' ? /(?<!\r)\n/.test(written) : written.includes('\r'),
    ).toBe(false)
    // The other imports stay.
    for (const line of lines.filter((line) => line.startsWith('import '))) {
      expect(outputLines).toContain(line)
    }
    expect(routerValueImports(written)).toEqual(['createFileRoute'])
    const { Route } = await evaluateRouteFile(
      written.replace(/^import .* from 'react'$/m, ''),
    )
    expect([Route.id, Route.createdWith]).toEqual(['/new', 'createFileRoute'])
  })

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
  ])('a route file calling createFileRoute next to $name gets it bound once', async ({ imports, uses }) => {
    const body = `export const uses = [${uses}]
export const Route = createFileRoute('/old')({})
`
    const { written } = await upkeep('new.tsx', `${imports}\n${body}`)

    await expectRouteFile(written, {
      id: '/new',
      expected: body.replace('/old', '/new'),
      routerExports: ['Link'],
    })
  })

  test('the added import ends with a semicolon in a file using them', async () => {
    const source = `import * as Router from ${router};
export const r = Router;
export const Route = createFileRoute('/old')({});
`
    const { written } = await upkeep('new.tsx', source)

    await expectRouteFile(written, {
      id: '/new',
      expected: source.replace('/old', '/new'),
    })
    const added = written
      .split('\n')
      .filter(
        (line) => line.startsWith('import ') && line.includes('createFileRoute'),
      )
    expect(added).toHaveLength(1)
    expect(added[0]).toMatch(/;$/)
  })

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

    await expectRouteFile(written, {
      id: '/new',
      expected: source.replace('/old', '/new'),
    })
    expect(routerValueImports(written)).not.toContain('LinkProps')
    const { module } = parseSync('route.tsx', written)
    expect(
      module.staticImports.flatMap((statement) =>
        statement.entries
          .filter((entry) => entry.isType)
          .map((entry) => entry.localName.value),
      ),
    ).toEqual(['LinkProps'])
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
      name: 'a BOM and astral characters before them',
      source: [
        '\uFEFF// 😀',
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

    await expectRouteFile(written, {
      id: '/new',
      expected: source.replace('/old', '/new'),
      routerExports: ['Link'],
    })
    // The file keeps its BOM and its line endings.
    expect(written.startsWith('\uFEFF')).toBe(source.startsWith('\uFEFF'))
    const crlf = source.includes('\r\n')
    expect(crlf ? /(?<!\r)\n/.test(written) : written.includes('\r')).toBe(
      false,
    )
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

  // A route id the generator cannot rewrite, or a malformed route call: the
  // user is told which file, by a failed run or by a warning (the file then
  // stays as it is).
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
    {
      name: 'options passed to createFileRoute directly',
      source: `import { createFileRoute } from ${router}
export const Route = createFileRoute({ component: () => null })
`,
    },
    {
      name: 'options passed to createLazyFileRoute directly',
      file: 'new.lazy.tsx',
      source: `import { createLazyFileRoute } from ${router}
export const Route = createLazyFileRoute({ component: () => null })
`,
    },
  ])('a route file with $name is reported by name', async ({ source, file = 'new.tsx' }) => {
    const { written, warnings, error } = await upkeep(file, source)

    if (error) {
      expect(error.message).toContain(file)
    } else {
      expect(warnings.join('\n')).toContain(file)
      expect(written).toBe(source)
    }
  })
})
