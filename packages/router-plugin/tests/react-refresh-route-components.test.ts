import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'
import { compileRouteModules } from './regression-helpers'
import type { ESTree } from 'vite'

function compileWithReactRefresh(code: string) {
  const { reference } = compileRouteModules(code, { hmr: true }).modules
  expect(reference).not.toBe(code)
  return reference!
}

function parseModule(code: string) {
  const { program, errors } = parseSync('route.tsx', code, {
    sourceType: 'module',
  })
  expect(errors).toEqual([])
  return program
}

function getTopLevelDeclarators(program: ESTree.Program) {
  const declarators: Array<ESTree.VariableDeclarator> = []
  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration'
        ? statement.declaration
        : statement
    if (declaration?.type === 'VariableDeclaration') {
      declarators.push(...declaration.declarations)
    }
  }
  return declarators
}

function getDeclaratorName(declarator: ESTree.VariableDeclarator) {
  return declarator.id.type === 'Identifier' ? declarator.id.name : undefined
}

/** Returns the value of `option` in `const Route = createXRoute({ ... })`. */
function getRouteOption(program: ESTree.Program, option: string) {
  const route = getTopLevelDeclarators(program).find(
    (declarator) => getDeclaratorName(declarator) === 'Route',
  )
  const options =
    route?.init?.type === 'CallExpression' ? route.init.arguments[0] : null
  if (options?.type !== 'ObjectExpression') {
    throw new Error('expected `Route` to be created with an options object')
  }
  const property = options.properties.find(
    (candidate) =>
      candidate.type === 'Property' &&
      candidate.key.type === 'Identifier' &&
      candidate.key.name === option,
  )
  if (property?.type !== 'Property') {
    throw new Error(`expected the \`${option}\` route option`)
  }
  return { route, value: property.value }
}

// A root route next to a factory that creates child routes inside a function.
const nestedRouteFactory = `
import { createRootRoute, createRoute } from '@tanstack/react-router'
export function makeChild(label: string) {
  return createRoute({
    getParentRoute: () => Route,
    path: label,
    component: () => <div>{label}</div>,
  })
}
export const Route = createRootRoute({ component: () => <div /> })
`

describe('React Refresh route component hoisting', () => {
  it('does not hoist a component out of the function scope it closes over', () => {
    const code = compileWithReactRefresh(nestedRouteFactory)
    // `label` only exists inside `makeChild`; any other top-level statement
    // that mentions it reads an undefined global at render time.
    const statementsUsingLabel = parseModule(code)
      .body.map((statement) => code.slice(statement.start, statement.end))
      .filter(
        (statement) =>
          /\blabel\b/.test(statement) &&
          !statement.includes('function makeChild('),
      )
    expect(statementsUsingLabel).toEqual([])
  })

  it('hoists the inline component of the root route next to a nested route factory', () => {
    const code = compileWithReactRefresh(nestedRouteFactory)
    // React Refresh can only register components bound to top-level names.
    const program = parseModule(code)
    const { value } = getRouteOption(program, 'component')
    expect(value.type).toBe('Identifier')
    const name = (value as ESTree.IdentifierReference).name
    expect(getTopLevelDeclarators(program).map(getDeclaratorName)).toContain(
      name,
    )
  })

  it('declares hoisted components before the route that uses them', () => {
    const code = compileWithReactRefresh(`
import { createRootRoute } from '@tanstack/react-router'
export const page = () => <div />, Route = createRootRoute({
  component: page,
  pendingComponent: () => <div />,
})
`)
    const program = parseModule(code)
    const { route, value } = getRouteOption(program, 'pendingComponent')
    // React Refresh needs the inline component hoisted to a top-level binding.
    expect(value.type).toBe('Identifier')
    const name = (value as ESTree.IdentifierReference).name
    const declaration = getTopLevelDeclarators(program).find(
      (declarator) => getDeclaratorName(declarator) === name,
    )
    // A `const` used before its declaration throws a TDZ ReferenceError when
    // the route is created.
    expect(declaration).toBeDefined()
    expect(declaration!.start).toBeLessThan(route!.start)
  })
})
