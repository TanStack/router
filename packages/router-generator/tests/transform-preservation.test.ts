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

function run(source: string, node = makeNode()) {
  return transform({
    source,
    ctx: { target: 'react', routeId: '/new', lazy: false },
    node,
  })
}

const routeImport = "import { createFileRoute } from '@tanstack/react-router'\n"

// The generator writes its output back over the user's route file, so every
// byte outside the route id and the router import must survive unchanged.
describe('transform preserves the rest of the route file', () => {
  it('edits the right spans after non-ASCII and astral characters', () => {
    const before = [
      '﻿// 😀 héllo 日本語',
      "import { createLazyFileRoute } from '@tanstack/react-router'",
      "import { createFileRoute } from '@tanstack/react-router'",
      "const label = '✓ 𝒳'",
    ]
    const after = [
      'export const Route = createFileRoute(/* 🚀 */ `/old`)({',
      '  component: () => <p>{label} é😀</p>, // ünïcode',
      '})',
      '',
    ]
    const result = run([...before, ...after].join('\n'))

    expect(result).toEqual({
      result: 'modified',
      output: [
        before[0],
        before[2],
        before[3],
        after[0]!.replace('`/old`', '`/new`'),
        ...after.slice(1),
      ].join('\n'),
    })
  })

  it('adds the constructor next to an aliased import of it', () => {
    const result = run(
      [
        "import { createFileRoute as cfr, Link } from '@tanstack/react-router'",
        'export const Route = createFileRoute(\'/old\')({ component: () => <Link to="/" /> })',
        "export const Other = cfr('/other')",
        '',
      ].join('\n'),
    )

    expect(result).toEqual({
      result: 'modified',
      output: [
        "import { createFileRoute as cfr, Link, createFileRoute } from '@tanstack/react-router'",
        'export const Route = createFileRoute(\'/new\')({ component: () => <Link to="/" /> })',
        "export const Other = cfr('/other')",
        '',
      ].join('\n'),
    })
  })

  it.each([
    {
      name: 'a default import',
      imports: "import Router, { Link } from '@tanstack/react-router'",
      expected:
        "import Router, { Link, createFileRoute } from '@tanstack/react-router'",
    },
    {
      name: 'a namespace import',
      imports: [
        "import * as Router from '@tanstack/react-router'",
        "import { Link } from '@tanstack/react-router'",
      ].join('\n'),
      expected: [
        "import * as Router from '@tanstack/react-router'",
        "import { Link, createFileRoute } from '@tanstack/react-router'",
      ].join('\n'),
    },
  ])('adds the missing constructor next to $name', ({ imports, expected }) => {
    const route = "export const Route = createFileRoute('/old')({})\n"
    expect(run(`${imports}\n${route}`)).toEqual({
      result: 'modified',
      output: `${expected}\n${route.replace('/old', '/new')}`,
    })
  })

  it('updates only the Route declarator of a multi-declarator export', () => {
    const result = run(
      [
        "import { createFileRoute } from '@tanstack/react-router'",
        "export const Route = createFileRoute('/old')({}), path = '/old'",
        '',
      ].join('\n'),
    )

    expect(result).toEqual({
      result: 'modified',
      output: [
        "import { createFileRoute } from '@tanstack/react-router'",
        "export const Route = createFileRoute('/new')({}), path = '/old'",
        '',
      ].join('\n'),
    })
  })

  it('records string-literal option keys and skips computed and spread keys', () => {
    const node = makeNode()
    const result = run(
      [
        "import { createFileRoute } from '@tanstack/react-router'",
        "const key = 'loader'",
        "export const Route = createFileRoute('/new')({ 'component': Page, [key]: load, ['head']: head, ...rest, server: {} })",
        '',
      ].join('\n'),
      node,
    )

    expect(result).toEqual({ result: 'not-modified' })
    expect(node.createFileRouteProps).toEqual(new Set(['component', 'server']))
  })
})

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
