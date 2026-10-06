import { describe, expect, it } from 'vitest'
import { transform } from '../src/transform/transform'
import type { RouteNode } from '../src/types'

function makeNode(): RouteNode {
  return {
    filePath: '/test.tsx',
    fullPath: '/test.tsx',
    variableName: 'TestRoute',
    _fsRouteType: 'static',
  }
}

const routeImport = "import { createFileRoute } from '@tanstack/react-router'\n"

function run(source: string, node = makeNode()) {
  return transform({
    source,
    ctx: { target: 'react', routeId: '/new', lazy: false },
    node,
  })
}

// Parentheses are transparent in JavaScript, and the generator rewrites the
// user's file in place: it must recognize the same route call with or without
// them and change only the route id.
describe('transform with parenthesized route call parts', () => {
  it.each([
    {
      name: 'string route id',
      route: "createFileRoute(('/old'))({})",
      expected: "createFileRoute(('/new'))({})",
    },
    {
      name: 'template route id',
      route: 'createFileRoute((`/old`))({})',
      expected: 'createFileRoute((`/new`))({})',
    },
    {
      name: 'route factory',
      route: "(createFileRoute)('/old')({})",
      expected: "(createFileRoute)('/new')({})",
    },
  ])('updates the route id of a parenthesized $name', ({ route, expected }) => {
    const result = run(`${routeImport}export const Route = ${route}\n`)

    expect(result).toEqual({
      result: 'modified',
      output: `${routeImport}export const Route = ${expected}\n`,
    })
  })

  it('accepts a parenthesized route id that is already correct', () => {
    expect(
      run(`${routeImport}export const Route = createFileRoute(('/new'))({})\n`),
    ).toEqual({ result: 'not-modified' })
  })

  it('records the options of a parenthesized options object', () => {
    const node = makeNode()
    const result = run(
      `${routeImport}export const Route = createFileRoute('/new')(({ component: Page, server: {} }))\n`,
      node,
    )

    expect(result).toEqual({ result: 'not-modified' })
    expect(node.createFileRouteProps).toEqual(new Set(['component', 'server']))
  })
})
