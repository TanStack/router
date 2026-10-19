/**
 * Not part of the compiler test corpus (out of scope: a unit suite of the
 * route file transform, an internal module, driven with hand-built route
 * nodes). The route file upkeep it implements is tested through full
 * generator runs in tests/route-file-upkeep.test.ts.
 */
import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'
import { transform } from '../../src/transform/transform'
import { routeCallOf, routeIdOf } from '../route-id'
import { evaluateModule } from '../route-tree'
import type { RouteNode } from '../../src/types'

/**
 * The local names of the values a module imports from `source`, in source
 * order.
 */
function valueImports(code: string, source: string) {
  const { module } = parseSync('route.tsx', code, { sourceType: 'module' })
  return module.staticImports
    .filter((statement) => statement.moduleRequest.value === source)
    .flatMap((statement) =>
      statement.entries
        .filter((entry) => !entry.isType)
        .map((entry) => entry.localName.value),
    )
}

/** The module without its import declarations (each on its own line). */
function withoutImports(code: string) {
  return code
    .split(/(?<=\n)/)
    .filter((line) => !line.startsWith('import '))
    .join('')
}

function makeNode(
  fsRouteType: RouteNode['_fsRouteType'] = 'static',
): RouteNode {
  return {
    filePath: '/test.tsx',
    fullPath: '/test.tsx',
    variableName: 'TestRoute',
    _fsRouteType: fsRouteType,
  }
}

function transformToNewRoute(source: string, node = makeNode()) {
  return transform({
    source,
    ctx: { target: 'react', routeId: '/new', lazy: false },
    node,
  })
}

describe('transform', () => {
  // Source: #8504 router-generator transform.test.ts ("reads route call
  // parts through parentheses and TypeScript wrappers"). Wrappers around the
  // constructor and the id are pinned in known-bugs.test.ts; recording the
  // option keys through a wrapper is best effort.
  it.each([
    `(({ component: Page, server: {} }) satisfies object)`,
    `({ component: Page, server: {} } as any)`,
  ])('rewrites the id of a route whose options are wrapped: %s', (options) => {
    const source = [
      "import { createFileRoute } from '@tanstack/react-router'",
      `export const Route = createFileRoute('/old')${options}`,
      '',
    ].join('\n')

    expect(transformToNewRoute(source)).toEqual({
      result: 'modified',
      output: source.replace('/old', '/new'),
    })
  })

  it('updates parenthesized route calls without changing their surrounding source', () => {
    const result = transform({
      source:
        "import { createFileRoute } from '@tanstack/react-router'; export const Route = ((createFileRoute('/old'))({}));",
      ctx: { target: 'react', routeId: '/new', lazy: false },
      node: makeNode(),
    })
    expect(result.result).toBe('modified')
    if (result.result === 'modified') {
      expect(result.output).toContain("((createFileRoute('/new'))({}))")
    }
  })

  it('does not treat root route exports as missing Route exports', async () => {
    const result = await transform({
      source: [
        "import { createRootRoute } from '@tanstack/react-router'",
        '',
        'export const Route = createRootRoute()({})',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/',
        lazy: false,
      },
      node: makeNode('__root'),
    })

    expect(result.result).toBe('not-modified')
  })

  it('does not treat createRootRouteWithContext exports as missing Route exports', async () => {
    const result = await transform({
      source: [
        "import { createRootRouteWithContext } from '@tanstack/react-router'",
        '',
        'interface RouterContext {}',
        '',
        'export const Route = createRootRouteWithContext<RouterContext>()({})',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/',
        lazy: false,
      },
      node: makeNode('__root'),
    })

    expect(result.result).toBe('not-modified')
  })

  it('does not treat createRootRoute exported via export { Route } as missing Route exports', async () => {
    const result = await transform({
      source: [
        "import { createRootRoute } from '@tanstack/react-router'",
        '',
        'const Route = createRootRoute()({})',
        '',
        'export { Route }',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/',
        lazy: false,
      },
      node: makeNode('__root'),
    })

    expect(result.result).toBe('not-modified')
  })

  it('returns an error result for parse failures', async () => {
    const result = await transform({
      source: "export const Route = createFileRoute('/broken')(",
      ctx: {
        target: 'react',
        routeId: '/broken',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('error')
  })

  it('rewrites an aliased exported Route binding', async () => {
    const node = makeNode()
    const result = await transform({
      source: [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        "const MyRoute = createFileRoute('/old')({ component: Component })",
        '',
        'export { MyRoute as Route }',
        '',
        'function Component() {',
        '  return null',
        '}',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node,
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    expect(result.output).toContain("createFileRoute('/new')")
  })

  it('keeps CRLF line endings, removing an unused import or not', async () => {
    const result = await transform({
      source: [
        "import { createFileRoute } from '@tanstack/react-router'",
        "import { createLazyFileRoute } from '@tanstack/react-router'",
        '',
        "export const Route = createFileRoute('/old')({})",
      ].join('\r\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    // (the unused createLazyFileRoute import may stay or go)
    expect([
      [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        "export const Route = createFileRoute('/new')({})",
      ].join('\r\n'),
      [
        "import { createFileRoute } from '@tanstack/react-router'",
        "import { createLazyFileRoute } from '@tanstack/react-router'",
        '',
        "export const Route = createFileRoute('/new')({})",
      ].join('\r\n'),
    ]).toContain(result.output)
  })

  it('preserves import formatting when only renaming the route constructor', async () => {
    const result = await transform({
      source: [
        'import {',
        '  Link,',
        '  createFileRoute,',
        `} from '@tanstack/react-router'`,
        '',
        "export const Route = createFileRoute('/old')({})",
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: true,
      },
      node: makeNode('lazy'),
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    expect(result.output).toBe(
      [
        'import {',
        '  Link,',
        '  createLazyFileRoute,',
        `} from '@tanstack/react-router'`,
        '',
        "export const Route = createLazyFileRoute('/new')({})",
      ].join('\n'),
    )
  })

  it('adds the missing constructor import with the file line ending', async () => {
    const body = [
      '',
      'export const link = Link',
      "export const Route = createFileRoute('/old')({})",
    ]
    const result = await transform({
      source: ["import { Link } from '@tanstack/react-router'", ...body].join(
        '\r\n',
      ),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    expect(result.output).not.toMatch(/(?<!\r)\n/)
    const { exports, router } = await evaluateModule(result.output)
    expect([routeCallOf(result.output).id, exports.link]).toEqual([
      '/new',
      router!.Link,
    ])
    expect(withoutImports(result.output)).toBe(
      withoutImports(body.join('\r\n').replace('/old', '/new')),
    )
  })

  it('ignores non-exported route constructor calls in the same file', async () => {
    const result = await transform({
      source: [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        "const OtherRoute = createFileRoute('/other')({})",
        "export const Route = createFileRoute('/old')({})",
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    expect(result.output).toContain(
      "const OtherRoute = createFileRoute('/other')({})",
    )
    expect(result.output).toContain(
      "export const Route = createFileRoute('/new')({})",
    )
  })

  it('returns an error for unsupported route id expressions', async () => {
    const result = await transform({
      source: [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        'const routeId = getRouteId()',
        'export const Route = createFileRoute(routeId)({})',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('error')
    if (result.result !== 'error') {
      throw new Error(`expected error result, got ${result.result}`)
    }
    expect(String(result.error)).toContain(
      'expected route id to be a string literal or plain template literal',
    )
  })

  it('returns a distinct error for malformed direct createFileRoute calls', async () => {
    const result = await transform({
      source: [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        'export const Route = createFileRoute({ component: Home })',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('error')
    if (result.result !== 'error') {
      throw new Error(`expected error result, got ${result.result}`)
    }
    expect(String(result.error)).toContain(
      "expected Route export in /new to use createFileRoute('/path')({...}) or createLazyFileRoute('/path')({...})",
    )
  })

  it('returns a distinct error for malformed direct createLazyFileRoute calls', async () => {
    const result = await transform({
      source: [
        "import { createLazyFileRoute } from '@tanstack/react-router'",
        '',
        'export const Route = createLazyFileRoute({ component: Home })',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: true,
      },
      node: makeNode('lazy'),
    })

    expect(result.result).toBe('error')
    if (result.result !== 'error') {
      throw new Error(`expected error result, got ${result.result}`)
    }
    expect(String(result.error)).toContain(
      "expected Route export in /new to use createFileRoute('/path')({...}) or createLazyFileRoute('/path')({...})",
    )
  })

  it('preserves double-quote route IDs', async () => {
    const result = await transform({
      source: [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        'export const Route = createFileRoute("/old")({})',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    expect(result.output).toContain('createFileRoute("/new")')
  })

  it('preserves template-literal route IDs', async () => {
    const result = await transform({
      source: [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        'export const Route = createFileRoute(`/old`)({})',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    expect(result.output).toContain('createFileRoute(`/new`)')
  })

  it('rewrites createLazyFileRoute to createFileRoute when lazy changes', async () => {
    const result = await transform({
      source: [
        "import { createLazyFileRoute } from '@tanstack/react-router'",
        '',
        "export const Route = createLazyFileRoute('/test')({})",
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/test',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    expect(result.output).toContain("createFileRoute('/test')")
    expect(result.output).not.toContain('createLazyFileRoute')
  })

  it('handles export { Route } with a separate const declaration', async () => {
    const result = await transform({
      source: [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        "const Route = createFileRoute('/old')({})",
        '',
        'export { Route }',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    expect(result.output).toContain("createFileRoute('/new')")
  })

  it('returns an error for multiple exported route calls', async () => {
    const result = await transform({
      source: [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        "export const Route = createFileRoute('/a')({})",
        '',
        "const AltRoute = createFileRoute('/b')({})",
        'export { AltRoute as Route }',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('error')
  })

  it('prepends a new import when no target-module import exists', async () => {
    const result = await transform({
      source: [
        "import { useState } from 'react'",
        '',
        "export const Route = createFileRoute('/old')({})",
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    expect(valueImports(result.output, '@tanstack/react-router')).toEqual([
      'createFileRoute',
    ])
    expect(result.output).toContain("import { useState } from 'react'")
    expect(
      await routeIdOf(result.output.replace(/^import .* from 'react'$/m, '')),
    ).toBe('/new')
  })

  it('returns not-modified for a non-route-constructor call', async () => {
    const result = await transform({
      source: [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        'export const Route = someOtherFactory()({})',
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/test',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('not-modified')
  })

  it('preserves semicolons in normalized imports', async () => {
    const result = await transform({
      source: [
        "import { createLazyFileRoute } from '@tanstack/react-router';",
        '',
        "export const Route = createLazyFileRoute('/old')({});",
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    expect(result.output).toContain(
      "import { createFileRoute } from '@tanstack/react-router';",
    )
    expect(result.output).not.toContain('createLazyFileRoute')
  })

  it('preserves type import specifiers when normalizing route imports', async () => {
    const result = await transform({
      source: [
        "import { type LinkProps, createLazyFileRoute } from '@tanstack/react-router'",
        '',
        "export const Route = createLazyFileRoute('/old')({})",
      ].join('\n'),
      ctx: {
        target: 'react',
        routeId: '/new',
        lazy: false,
      },
      node: makeNode(),
    })

    expect(result.result).toBe('modified')
    if (result.result !== 'modified') {
      throw new Error(`expected modified result, got ${result.result}`)
    }
    expect(result.output).toContain(
      "import { type LinkProps, createFileRoute } from '@tanstack/react-router'",
    )
    expect(result.output).not.toContain('createLazyFileRoute')
  })
})

// The generator writes its output back over the user's route file, so every
// byte outside the route id and the router import must survive unchanged.
describe('transform preserves the rest of the route file', () => {
  it('edits the right spans after a BOM and astral characters', () => {
    const result = transformToNewRoute(
      [
        '\uFEFF// 😀',
        "import { createLazyFileRoute } from '@tanstack/react-router'",
        "import { createFileRoute } from '@tanstack/react-router'",
        "export const Route = createFileRoute(/* 🚀 */ '/old')({})",
      ].join('\n'),
    )

    expect(result.result).toBe('modified')
    // (the unused createLazyFileRoute import may stay or go)
    expect([
      [
        '\uFEFF// 😀',
        "import { createFileRoute } from '@tanstack/react-router'",
        "export const Route = createFileRoute(/* 🚀 */ '/new')({})",
      ].join('\n'),
      [
        '\uFEFF// 😀',
        "import { createLazyFileRoute } from '@tanstack/react-router'",
        "import { createFileRoute } from '@tanstack/react-router'",
        "export const Route = createFileRoute(/* 🚀 */ '/new')({})",
      ].join('\n'),
    ]).toContain(result.result === 'modified' ? result.output : undefined)
  })

  it.each([
    {
      name: 'an aliased import of the constructor',
      imports:
        "import { createFileRoute as cfr } from '@tanstack/react-router'",
      uses: 'cfr',
      bound: ['createFileRoute'],
    },
    {
      // The constructor goes into the named import, never the namespace one
      // (`import * as Router, { ... }` does not parse).
      name: 'a namespace import',
      imports: [
        "import * as Router from '@tanstack/react-router'",
        "import { Link } from '@tanstack/react-router'",
      ].join('\n'),
      uses: 'Router.Link, Link',
      bound: ['Link', 'Link'],
    },
  ])(
    'adds the missing constructor next to $name',
    async ({ imports, uses, bound }) => {
      const body = `export const uses = [${uses}]
export const Route = createFileRoute('/old')({})`
      const result = transformToNewRoute(`${imports}\n${body}`)

      expect(result.result).toBe('modified')
      if (result.result !== 'modified') {
        throw new Error(`expected modified result, got ${result.result}`)
      }
      // The constructor is bound once; the output evaluates (a constructor
      // merged into the namespace import would not parse).
      expect(
        valueImports(result.output, '@tanstack/react-router').filter(
          (name) => name === 'createFileRoute',
        ),
      ).toHaveLength(1)
      const { exports, router } = await evaluateModule(result.output)
      expect(routeCallOf(result.output).id).toBe('/new')
      // (the router package exports the uses are bound to)
      expect(
        exports.uses.map((value: unknown) =>
          Object.keys(router).find((name) => router![name] === value),
        ),
      ).toEqual(bound)
      expect(withoutImports(result.output)).toBe(
        withoutImports(body.replace('/old', '/new')),
      )
    },
  )

  // Source: TanStack/router#7341. In a `.ts` file, `<T>value` is a type
  // assertion and `<T>(value: T) => value` a generic arrow function, not JSX.
  it('parses a .ts route file with angle-bracket type assertions', () => {
    const body = [
      'const identity = <T>(value: T) => value',
      "export const Route = createFileRoute('/old')({",
      '  loader: () => <number>identity(<unknown>1),',
      '})',
    ]
    const result = transform({
      source: [
        "import { createFileRoute } from '@tanstack/react-router'",
        ...body,
      ].join('\n'),
      filename: '/routes/old.ts',
      ctx: { target: 'react', routeId: '/new', lazy: false },
      node: makeNode(),
    })

    expect(result).toEqual({
      result: 'modified',
      output: [
        "import { createFileRoute } from '@tanstack/react-router'",
        ...body,
      ]
        .join('\n')
        .replace("'/old'", "'/new'"),
    })
  })

  it('updates only the Route declarator of a multi-declarator export', () => {
    const result = transformToNewRoute(
      [
        "import { createFileRoute } from '@tanstack/react-router'",
        "export const Route = createFileRoute('/old')({}), path = '/old'",
      ].join('\n'),
    )

    expect(result).toEqual({
      result: 'modified',
      output: [
        "import { createFileRoute } from '@tanstack/react-router'",
        "export const Route = createFileRoute('/new')({}), path = '/old'",
      ].join('\n'),
    })
  })
})

const routerPackage = "'@tanstack/react-router'"

/** Transforms `source` for the route `/new` (lazy or not). */
function transformTo(source: string, lazy = false) {
  return transform({
    source,
    ctx: { target: 'react', routeId: '/new', lazy },
    node: makeNode(),
  })
}

/** The output of a transform that must have modified the file. */
function modifiedOutput(result: ReturnType<typeof transform>) {
  if (result.result !== 'modified') {
    throw new Error(`expected modified result, got ${result.result}`)
  }
  return result.output
}

describe('route constructor imports when the route id is already right', () => {
  it.each([
    {
      name: 'no router import',
      lazy: false,
      source: `export const Route = createFileRoute('/new')({})`,
    },
    {
      name: 'a stale import of the other constructor',
      lazy: false,
      source: `import { createFileRoute } from ${routerPackage}
import { createLazyFileRoute } from ${routerPackage}
export const Route = createFileRoute('/new')({})`,
    },
    {
      name: 'a stale import of the other constructor next to another import',
      lazy: false,
      source: `import { Link, createFileRoute, createLazyFileRoute } from ${routerPackage}
export const link = Link
export const Route = createFileRoute('/new')({})`,
    },
    {
      name: 'only the other constructor imported',
      lazy: false,
      source: `import { createLazyFileRoute } from ${routerPackage}
export const Route = createFileRoute('/new')({})`,
    },
    {
      name: 'the constructor of a lazy route called as createFileRoute',
      lazy: true,
      source: `import { createLazyFileRoute } from ${routerPackage}
export const Route = createFileRoute('/new')({})`,
    },
  ])(
    'the file gets the right constructor import, with $name',
    async ({ lazy, source }) => {
      const output = modifiedOutput(transformTo(source, lazy))

      await evaluateModule(output)
      expect(routeCallOf(output).id).toBe('/new')
      const [required, other] = lazy
        ? ['createLazyFileRoute', 'createFileRoute']
        : ['createFileRoute', 'createLazyFileRoute']
      const imported = valueImports(output, '@tanstack/react-router')
      expect(imported.filter((name) => name === required)).toHaveLength(1)
      // (an unused import of the other constructor may stay or go)
      expect(output).not.toContain(`${other}(`)
    },
  )
})

describe('modules that are not routes', () => {
  it('a Route export from another binding is left as it is', () => {
    expect(
      transformTo(
        `import { postsRoute } from './posts'\nexport const Route = postsRoute`,
      ).result,
    ).toBe('not-modified')
  })

  it('an interpolated template literal route id is an error', () => {
    expect(
      transformTo(
        'const x = 1\nexport const Route = createFileRoute(`/${x}`)({})',
      ).result,
    ).toBe('error')
  })
})

describe('import declarations the transform rewrites', () => {
  it.each([
    {
      name: 'an inline type specifier in a rewritten declaration',
      source: `import { type LinkProps, createLazyFileRoute } from ${routerPackage}
import { createFileRoute } from ${routerPackage}
export type Props = LinkProps
export const Route = createFileRoute('/old')({})`,
    },
    {
      name: 'a type-only declaration next to a missing constructor import',
      source: `import type { LinkProps } from ${routerPackage}
export type Props = LinkProps
export const Route = createFileRoute('/old')({})`,
    },
  ])('type imports stay type-only: $name', ({ source }) => {
    const output = modifiedOutput(transformTo(source))

    expect(valueImports(output, '@tanstack/react-router')).toEqual([
      'createFileRoute',
    ])
    const { module } = parseSync('route.tsx', output)
    expect(
      module.staticImports.flatMap((statement) =>
        statement.entries
          .filter((entry) => entry.isType)
          .map((entry) => entry.localName.value),
      ),
    ).toEqual(['LinkProps'])
    expect(routeCallOf(output).id).toBe('/new')
  })

  it.each([
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
  ])(
    'a missing constructor import is added on its own line, with $name',
    ({ newline, lines }) => {
      const output = modifiedOutput(transformTo(lines.join(newline)))

      const outputLines = output.split(newline)
      expect(outputLines.filter((line) => !line.startsWith('import '))).toEqual(
        lines.map((line) => line.replace('/old', '/new')),
      )
      // No other line ending is mixed in.
      expect(
        newline === '\n' ? output.includes('\r') : /(?<!\r)\n/.test(output),
      ).toBe(false)
      expect(routeCallOf(output).id).toBe('/new')
    },
  )

  it('a stale import declaration is removed with its trailing whitespace, keeping the blank line after it, or kept', () => {
    const source = `import { createFileRoute } from ${routerPackage}
import { createLazyFileRoute } from ${routerPackage} \t

export const Route = createFileRoute('/old')({})`
    expect([
      `import { createFileRoute } from ${routerPackage}

export const Route = createFileRoute('/new')({})`,
      source.replace('/old', '/new'),
    ]).toContain(modifiedOutput(transformTo(source)))
  })

  it('a stale import declaration on the line of another one, removed or not, leaves valid code', () => {
    const output = modifiedOutput(
      transformTo(
        `import { createLazyFileRoute } from ${routerPackage}; import { createFileRoute } from ${routerPackage}
export const Route = createFileRoute('/old')({})`,
      ),
    )

    expect(routeCallOf(output).id).toBe('/new')
    expect(
      valueImports(output, '@tanstack/react-router').filter(
        (name) => name === 'createFileRoute',
      ),
    ).toHaveLength(1)
  })

  it('a rewritten declaration keeps its semicolon, and the other declarations stay as they are', () => {
    const source = `import { Link, createLazyFileRoute } from ${routerPackage};
import { createFileRoute } from ${routerPackage};
export const Route = createFileRoute('/old')({})
export const link = Link`
    expect([
      source.replace(', createLazyFileRoute', '').replace('/old', '/new'),
      source.replace('/old', '/new'),
    ]).toContain(modifiedOutput(transformTo(source)))
  })

  it('an added constructor import ends with a semicolon in a file using them', () => {
    const source = `import * as Router from ${routerPackage};
export const r = Router;
export const Route = createFileRoute('/old')({});`
    const output = modifiedOutput(transformTo(source))

    const [added, ...rest] = output.split('\n')
    expect(added).toMatch(/^import .*createFileRoute.*;$/)
    expect(rest.join('\n')).toBe(source.replace('/old', '/new'))
    expect(routeCallOf(output).id).toBe('/new')
  })

  it('renaming the constructor keeps the multi-line formatting of its import declaration', () => {
    const source = `import Router, {
  Link as L,
  createFileRoute,
} from ${routerPackage}
export const uses = [Router, L]
export const Route = createFileRoute('/new')({})`
    expect(transformTo(source, true)).toEqual({
      result: 'modified',
      output: source.replaceAll('createFileRoute', 'createLazyFileRoute'),
    })
  })

  it('an import declaration the transform does not need to change stays byte for byte', () => {
    const source = `import {Link} from ${routerPackage}
import { createFileRoute, createLazyFileRoute } from ${routerPackage}
export const link = Link
export const Route = createFileRoute('/old')({})`
    expect([
      source.replace(', createLazyFileRoute', '').replace('/old', '/new'),
      source.replace('/old', '/new'),
    ]).toContain(modifiedOutput(transformTo(source)))
  })

  it('a stale import next to an aliased import of the constructor leaves the constructor bound once', () => {
    const output = modifiedOutput(
      transformTo(`import { Link, createLazyFileRoute } from ${routerPackage}
import { createFileRoute as cfr } from ${routerPackage}
export const uses = [Link, cfr]
export const Route = createFileRoute('/old')({})`),
    )

    expect(routeCallOf(output).id).toBe('/new')
    expect(
      valueImports(output, '@tanstack/react-router').filter(
        (name) => name === 'createFileRoute',
      ),
    ).toHaveLength(1)
  })
})
