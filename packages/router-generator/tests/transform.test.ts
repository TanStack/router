import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'
import { transform } from '../src/transform/transform'
import { evaluateRouteFile, routeIdOf } from './route-id'
import type { RouteNode } from '../src/types'

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
  it('reads and rewrites the route constructor, id and options through parentheses', () => {
    const node = makeNode()
    const result = transformToNewRoute(
      [
        "import { createLazyFileRoute } from '@tanstack/react-router'",
        "export const Route = (createLazyFileRoute)(('/old'))(({ component: Page, server: {} }))",
      ].join('\n'),
      node,
    )

    expect(result).toEqual({
      result: 'modified',
      output: [
        "import { createFileRoute } from '@tanstack/react-router'",
        "export const Route = (createFileRoute)(('/new'))(({ component: Page, server: {} }))",
      ].join('\n'),
    })
  })

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

  it('removes imports cleanly with CRLF line endings', async () => {
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
    expect(result.output).toBe(
      [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        "export const Route = createFileRoute('/new')({})",
      ].join('\r\n'),
    )
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
    const evaluated = await evaluateRouteFile(result.output, ['Link'])
    expect([evaluated.Route.id, evaluated.link]).toEqual(['/new', 'Link'])
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

  // Source: #8504 router-generator transform.test.ts ("returns an error when
  // a redeclared Route var holds two route calls").
  it('returns an error when a redeclared Route var holds two route calls', () => {
    const result = transformToNewRoute(
      [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        "var Route = createFileRoute('/a')({})",
        "var Route = createFileRoute('/b')({})",
        'export { Route }',
      ].join('\n'),
    )

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

    expect(result).toEqual({
      result: 'modified',
      output: [
        '\uFEFF// 😀',
        "import { createFileRoute } from '@tanstack/react-router'",
        "export const Route = createFileRoute(/* 🚀 */ '/new')({})",
      ].join('\n'),
    })
  })

  it.each([
    {
      name: 'a default import',
      imports: "import Router from '@tanstack/react-router'",
      uses: 'Router',
      bound: ['default'],
    },
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
      const evaluated = await evaluateRouteFile(result.output, [
        'default',
        'Link',
      ])
      expect(evaluated.Route.id).toBe('/new')
      expect(
        evaluated.uses.map((value: unknown) =>
          typeof value === 'function' ? 'createFileRoute' : value,
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
