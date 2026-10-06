import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'
import { compileCodeSplitReferenceRoute } from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import type { ESTree } from 'vite'

function compileWithReactRefresh(code: string) {
  const result = compileCodeSplitReferenceRoute({
    code,
    filename: 'route.tsx',
    id: 'route.tsx',
    addHmr: true,
    codeSplitGroupings: defaultCodeSplitGroupings,
    targetFramework: 'react',
    compilerPlugins: getFrameworkHmrCompilerPlugins({
      targetFramework: 'react',
    }),
  })
  expect(result).toBeTruthy()
  return result!.code
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

describe('React Refresh route component hoisting', () => {
  it('does not hoist a component out of the function scope it closes over', () => {
    const code = compileWithReactRefresh(`
import { createRootRoute, createRoute } from '@tanstack/react-router'
export function makeChild(label: string) {
  return createRoute({
    getParentRoute: () => Route,
    path: label,
    component: () => <div>{label}</div>,
  })
}
export const Route = createRootRoute({ component: () => <div /> })
`)
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
    const code = compileWithReactRefresh(`
import { createRootRoute, createRoute } from '@tanstack/react-router'
export function makeChild(label: string) {
  return createRoute({
    getParentRoute: () => Route,
    path: label,
    component: () => <div>{label}</div>,
  })
}
export const Route = createRootRoute({ component: () => <div /> })
`)
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
    if (value.type !== 'Identifier') {
      // Not hoisted: there is no declaration to order.
      return
    }
    const declaration = getTopLevelDeclarators(program).find(
      (declarator) => getDeclaratorName(declarator) === value.name,
    )
    // A `const` used before its declaration throws a TDZ ReferenceError when
    // the route is created.
    expect(declaration).toBeDefined()
    expect(declaration!.start).toBeLessThan(route!.start)
  })
})
