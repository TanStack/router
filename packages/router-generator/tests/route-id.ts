/**
 * Shared test helper: the route constructor call a route file exports as
 * `Route`, read from the file's syntax tree (Oxc, Vite's parser).
 *
 * The route id a file route passes to `createFileRoute` is used by the
 * types only (`FileRoutesByPath`); at runtime the router takes ids from the
 * route tree. Upkeep of that argument is therefore checked on its parsed
 * value, not by running the file. What the file does at runtime is checked
 * by loading the route tree with the real router (route-tree.ts).
 */
import { parseSync } from 'vite'

/** The router packages a route file may import its route constructor from. */
const routerPackages = /^@tanstack\/(?:react|solid|vue)-router$/

/** The route constructor call a route file's `Route` export is. */
export interface RouteCall {
  /**
   * The router package export the called constructor is bound to
   * (`createFileRoute`, `createLazyFileRoute`, `createRootRoute`, …), or
   * undefined when the callee is not bound to a router package import.
   */
  constructor: string | undefined
  /** The value of the string literal the constructor gets, if any. */
  id: string | undefined
}

type Node = Record<string, any>

/** `node` without the TypeScript wrappers and parentheses around it. */
function unwrap(node: Node | null | undefined): Node | undefined {
  let current = node ?? undefined
  while (
    current &&
    [
      'TSAsExpression',
      'TSSatisfiesExpression',
      'TSNonNullExpression',
      'TSTypeAssertion',
      'ParenthesizedExpression',
    ].includes(current.type)
  ) {
    current = current.expression
  }
  return current
}

/** The value of a string literal or a template literal without expressions. */
function stringValue(node: Node | undefined) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value as string
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked as string
  }
  return undefined
}

/** The name of an identifier or string module export name. */
function nameOf(node: Node) {
  return (node.type === 'Identifier' ? node.name : node.value) as string
}

/**
 * Reads the route constructor call that `code` (a route file) exports as
 * `Route`: `export const Route = createFileRoute('/id')({ ... })` or a
 * declaration exported under that name, with any TypeScript wrappers. Fails
 * when the file does not parse or exports no such `Route`.
 */
export function routeCallOf(code: string, fileName = 'route.tsx'): RouteCall {
  const { program, errors } = parseSync(fileName, code)
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join('\n'))
  }

  /** Local name to the router package export it is bound to. */
  const bindings = new Map<string, string>()
  /** Local names of namespace imports of a router package. */
  const namespaces = new Set<string>()
  /** Top-level variable initializers, by name. */
  const initializers = new Map<string, Node | undefined>()
  /** The local name exported as `Route`. */
  let exported: string | undefined

  const declare = (declaration: Node | null | undefined) => {
    if (declaration?.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        if (declarator.id.type === 'Identifier') {
          initializers.set(declarator.id.name, declarator.init)
        }
      }
    }
  }
  for (const statement of program.body as Array<Node>) {
    if (statement.type === 'ImportDeclaration') {
      if (
        !routerPackages.test(statement.source.value) ||
        statement.importKind === 'type'
      ) {
        continue
      }
      for (const specifier of statement.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          namespaces.add(specifier.local.name)
        } else if (
          specifier.type === 'ImportSpecifier' &&
          specifier.importKind !== 'type'
        ) {
          bindings.set(specifier.local.name, nameOf(specifier.imported))
        }
      }
    } else if (statement.type === 'VariableDeclaration') {
      declare(statement)
    } else if (statement.type === 'ExportNamedDeclaration') {
      declare(statement.declaration)
      if (
        statement.declaration?.type === 'VariableDeclaration' &&
        statement.declaration.declarations.some(
          (declarator: Node) =>
            declarator.id.type === 'Identifier' &&
            declarator.id.name === 'Route',
        )
      ) {
        exported = 'Route'
      }
      if (!statement.source) {
        for (const specifier of statement.specifiers) {
          if (nameOf(specifier.exported) === 'Route') {
            exported = nameOf(specifier.local)
          }
        }
      }
    }
  }

  const route = exported === undefined ? undefined : initializers.get(exported)
  const call = unwrap(route)
  if (call?.type !== 'CallExpression') {
    throw new Error('The route file exports no Route created by a call')
  }
  // `createFileRoute('/id')(options)`, or `createRootRoute(options)`
  const factory = unwrap(call.callee)
  const constructorCall = factory?.type === 'CallExpression' ? factory : call
  const callee = unwrap(constructorCall.callee)
  let constructor: string | undefined
  if (callee?.type === 'Identifier') {
    constructor = bindings.get(callee.name)
  } else if (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    namespaces.has(callee.object.name)
  ) {
    constructor = callee.property.name
  }
  return {
    constructor,
    id:
      constructorCall === call
        ? undefined
        : stringValue(unwrap(constructorCall.arguments[0])),
  }
}

/** The route id a route file passes to its route constructor. */
export async function routeIdOf(code: string): Promise<string | undefined> {
  return routeCallOf(code).id
}
