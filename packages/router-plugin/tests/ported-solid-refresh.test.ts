/**
 * Scenarios ported from solid-refresh's transform tests
 * (solidjs/solid-refresh `tests/client/vite.test.ts`, MIT).
 *
 * solid-refresh runs after the router plugin on every route module and split
 * chunk. It registers top-level PascalCase components with at most one
 * parameter and top-level `createContext` calls, and honours file-level
 * `@refresh reload` / `@refresh skip` comments. These tests check that route
 * HMR and code splitting hand it modules in that shape.
 */
import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'
import type { ESTree } from 'vite'

const head = `import { createFileRoute } from '@tanstack/solid-router'\n`

/** Runs the route HMR plugin used when automatic code splitting is off. */
function compileWithRouteHmr(code: string) {
  return transformWithRouteHmrPlugin(code, { target: 'solid' })
}

/** Compiles every module the code splitter emits for a Solid route, with HMR. */
function compileWithCodeSplitting(code: string) {
  return compileRouteModules(code, { hmr: true, targetFramework: 'solid' })
    .modules
}

function parseModule(code: string) {
  const { program, errors } = parseSync('route.tsx', code, {
    sourceType: 'module',
  })
  expect(errors).toEqual([])
  return program
}

type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression

/** Top-level function bound to `name`, the way solid-refresh looks it up. */
function topLevelFunction(code: string, name: string) {
  for (const statement of parseModule(code).body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
        ? statement.declaration
        : statement
    if (declaration?.type === 'FunctionDeclaration') {
      if (declaration.id?.name === name) {
        return declaration as FunctionNode
      }
      continue
    }
    if (declaration?.type !== 'VariableDeclaration') {
      continue
    }
    for (const declarator of declaration.declarations) {
      if (
        declarator.id.type === 'Identifier' &&
        declarator.id.name === name &&
        (declarator.init?.type === 'ArrowFunctionExpression' ||
          declarator.init?.type === 'FunctionExpression')
      ) {
        return declarator.init as FunctionNode
      }
    }
  }
  return undefined
}

/** Asserts `name` is a component solid-refresh registers. */
function expectSolidComponent(code: string, name: string) {
  expect(name).toMatch(/^[A-Z]/)
  const fn = topLevelFunction(code, name)
  expect(fn).toBeDefined()
  expect(fn!.params.length).toBeLessThan(2)
  expect(fn!.async || fn!.generator).toBe(false)
}

/** Top-level `const <name> = createContext(...)` declarations in a module. */
function topLevelContexts(code: string) {
  const names: Array<string> = []
  for (const statement of parseModule(code).body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration'
        ? statement.declaration
        : statement
    if (declaration?.type !== 'VariableDeclaration') {
      continue
    }
    for (const declarator of declaration.declarations) {
      if (
        declarator.id.type === 'Identifier' &&
        declarator.init?.type === 'CallExpression' &&
        declarator.init.callee.type === 'Identifier' &&
        declarator.init.callee.name === 'createContext'
      ) {
        names.push(declarator.id.name)
      }
    }
  }
  return names
}

describe('ported solid-refresh: components', () => {
  // Source: vite.test.ts "should transform FunctionDeclaration with valid Component name and params",
  // "should transform VariableDeclarator w/ ArrowFunctionExpression ..." and
  // "should transform ExportNamedDeclaration w/ FunctionExpression ..."
  it.each([
    [
      'a function declaration with props',
      `function Page(props: { title?: string }) {\n  return <p>{props.title}</p>\n}`,
      'component',
    ],
    ['a const arrow function', `const Page = () => <p>hi</p>`, 'component'],
    [
      // Exported bindings are not split, so the component stays in the reference module.
      'an exported function expression',
      `export const Page = function () {\n  return <p>hi</p>\n}`,
      'reference',
    ],
  ])(
    'keeps a component declared as %s registrable',
    async (_, declaration, holder) => {
      const source = `${head}${declaration}
export const Route = createFileRoute('/')({ component: Page })`

      const hmr = await compileWithRouteHmr(source)
      expect(await getModuleErrors(hmr)).toEqual([])
      expectSolidComponent(hmr, 'Page')
      expect(hmr).toContain('import.meta.hot')

      const modules = compileWithCodeSplitting(source)
      for (const code of Object.values(modules)) {
        expect(await getModuleErrors(code)).toEqual([])
      }
      if (holder === 'reference') {
        expectSolidComponent(modules.reference!, 'Page')
        return
      }
      const local = modules['virtual component']!.match(
        /export \{ (\w+) as component \}/,
      )?.[1]
      expect(local).toBeDefined()
      expectSolidComponent(modules['virtual component']!, local!)
    },
  )

  // Source: vite.test.ts "should transform VariableDeclarator w/ ArrowFunctionExpression with valid Component name and params"
  it('declares an inline split component as a registrable top-level component', async () => {
    const modules =
      compileWithCodeSplitting(`${head}export const Route = createFileRoute('/')({
  component: () => <p>component</p>,
  errorComponent: (props: { error: unknown }) => <p>{String(props.error)}</p>,
})`)
    for (const split of ['component', 'errorComponent']) {
      const chunk = modules[`virtual ${split}`]!
      expect(await getModuleErrors(chunk)).toEqual([])
      const local = chunk.match(
        new RegExp(String.raw`export \{ (\w+) as ${split} \}`),
      )?.[1]
      expect(local).toBeDefined()
      expectSolidComponent(chunk, local!)
    }
  })

  // Source: vite.test.ts (solid-refresh output carries no React Refresh runtime calls)
  it('adds no React Refresh code to Solid routes', async () => {
    const source = `${head}function page() {\n  return <p>hi</p>\n}
export const Route = createFileRoute('/')({ component: page, pendingComponent: () => <p>pending</p> })`
    const outputs = [
      await compileWithRouteHmr(source),
      ...Object.values(compileWithCodeSplitting(source)),
    ]
    for (const code of outputs) {
      expect(code).not.toMatch(
        /TSRFastRefreshAnchor|__TSR_REACT_REFRESH__|TSRComponent|TSRPendingComponent/,
      )
    }
  })
})

describe('ported solid-refresh: @refresh comments', () => {
  // Source: vite.test.ts "should skip FunctionDeclaration with @refresh reload",
  // "should skip FunctionDeclaration with @refresh skip" and "@refresh reload should work"
  // solid-refresh reads these comments per module, so every module that holds
  // route code must keep them.
  it.each([
    ['// @refresh reload', '@refresh reload'],
    ['/* @refresh reload */', '@refresh reload'],
    ['// @refresh skip', '@refresh skip'],
  ])('keeps a %s file header', async (header, pragma) => {
    const source = `${header}\n${head}function Page() {\n  return <p>hi</p>\n}
export const Route = createFileRoute('/')({ component: Page })`
    expect(await compileWithRouteHmr(source)).toContain(pragma)
    const modules = compileWithCodeSplitting(source)
    expect({
      reference: modules.reference!.includes(pragma),
      component: modules['virtual component']!.includes(pragma),
    }).toEqual({ reference: true, component: true })
  })

  // Source: vite.test.ts "should skip FunctionDeclaration with @refresh reload"
  it('keeps // @refresh reload written above a split component', () => {
    const modules = compileWithCodeSplitting(`${head}// @refresh reload
function Page() {
  return <p>hi</p>
}
export const Route = createFileRoute('/')({ component: Page })`)
    expect({
      reference: modules.reference!.includes('@refresh reload'),
      component: modules['virtual component']!.includes('@refresh reload'),
    }).toEqual({ reference: true, component: true })
  })
})

describe('ported solid-refresh: Context API', () => {
  // Source: vite.test.ts "Context API should support top-level VariableDeclaration"
  // solid-refresh keeps a context's identity across updates by wrapping the
  // top-level `createContext` call; a second call would create a second context.
  it('declares a context shared by two split components once, at the top level', async () => {
    const modules =
      compileWithCodeSplitting(`${head}import { createContext, useContext } from 'solid-js'
const Theme = createContext('light')
function Label() {
  return <p>{useContext(Theme)}</p>
}
export const Route = createFileRoute('/')({
  component: () => (
    <Theme.Provider value="dark">
      <Label />
    </Theme.Provider>
  ),
  errorComponent: () => <p>{useContext(Theme)}</p>,
})`)
    const declaring = Object.entries(modules).filter(
      ([, code]) => topLevelContexts(code).length > 0,
    )
    expect(declaring.map(([name]) => name)).toHaveLength(1)
    expect(topLevelContexts(declaring[0]![1])).toEqual(['Theme'])
    for (const code of Object.values(modules)) {
      expect(await getModuleErrors(code)).toEqual([])
      expect(code.match(/\bcreateContext\(/g)?.length ?? 0).toBeLessThan(2)
    }
  })

  // Source: vite.test.ts "Context API should support ExportNamedDeclaration"
  // and "should not support VariableDeclaration that is not top-level"
  it('moves a context used only by the split component to the top level of its chunk', () => {
    const modules =
      compileWithCodeSplitting(`${head}import { createContext, useContext } from 'solid-js'
const Theme = createContext('light')
export const Route = createFileRoute('/')({
  component: () => <p>{useContext(Theme)}</p>,
})`)
    expect(topLevelContexts(modules['virtual component']!)).toEqual(['Theme'])
    expect(modules.reference).not.toContain('createContext(')
  })
})
