/**
 * Independent observers of code as the dev server serves it to the page:
 * an Oxc parse of the served JavaScript, for the few checks that SPEC states
 * on modules (J2.5 dependency absence, directives), never on generated
 * names, layout or printing.
 */
import { parseSync } from 'vite'

/**
 * The requests a module served to the page imports, statically or by a
 * literal dynamic import, without their query (an independent parse of the
 * served code: what Vite resolved each import to).
 */
export function servedImports(code: string): Array<string> {
  const { module } = parseSync('module.js', code, { sourceType: 'module' })
  const requests: Array<string> = []
  for (const statement of module.staticImports) {
    requests.push(statement.moduleRequest.value)
  }
  for (const statement of module.dynamicImports) {
    const request = code.slice(
      statement.moduleRequest.start,
      statement.moduleRequest.end,
    )
    const literal = /^(['"`])([^'"`\\$]*)\1$/.exec(request)
    if (literal) {
      requests.push(literal[2]!)
    }
  }
  for (const statement of module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.moduleRequest) {
        requests.push(entry.moduleRequest.value)
      }
    }
  }
  return requests.map((request) => request.split('?')[0]!)
}

type Node = Record<string, any>

/** Visits every node of an ESTree tree. */
function walk(node: unknown, visit: (node: Node, parent?: Node) => void) {
  const go = (value: unknown, parent?: Node) => {
    if (!value || typeof value !== 'object') {
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        go(item, parent)
      }
      return
    }
    const current = value as Node
    if (typeof current.type === 'string') {
      visit(current, parent)
    }
    for (const key of Object.keys(current)) {
      if (key !== 'type' && key !== 'start' && key !== 'end') {
        go(current[key], typeof current.type === 'string' ? current : parent)
      }
    }
  }
  go(node)
}

/**
 * Whether a served module reads the binding `name` (any binding when
 * `name` is left out) that it imports from `request` (its path, or a
 * pattern of its request), by a named or default import, or as a member of
 * a namespace import (a namespace read whole reads every binding), or
 * re-exports it. An unused import specifier is free (SPEC §5.9: the
 * bundler drops it); reading it would carry the code that reads it.
 */
export function readsImport(
  code: string,
  request: string | RegExp,
  name?: string,
) {
  const { program } = parseSync('module.js', code, { sourceType: 'module' })
  const from = (source: Node | null | undefined) =>
    source !== null &&
    source !== undefined &&
    (typeof request === 'string'
      ? String(source.value).split('?')[0] === request
      : request.test(String(source.value)))
  const exported = (node: Node) => (node.name ?? node.value) as string
  const locals = new Set<string>()
  const namespaces = new Set<string>()
  let reExports = false
  for (const statement of program.body as Array<Node>) {
    if (statement.type === 'ImportDeclaration' && from(statement.source)) {
      for (const specifier of statement.specifiers as Array<Node>) {
        if (specifier.importKind === 'type') {
          continue
        }
        if (specifier.type === 'ImportNamespaceSpecifier') {
          namespaces.add(specifier.local.name)
        } else if (
          name === undefined ||
          (specifier.type === 'ImportDefaultSpecifier'
            ? name === 'default'
            : exported(specifier.imported) === name)
        ) {
          locals.add(specifier.local.name)
        }
      }
    } else if (
      (statement.type === 'ExportAllDeclaration' ||
        statement.type === 'ExportNamedDeclaration') &&
      from(statement.source)
    ) {
      reExports ||=
        statement.type === 'ExportAllDeclaration' ||
        (statement.specifiers as Array<Node>).some(
          (specifier) =>
            name === undefined || exported(specifier.local) === name,
        )
    }
  }
  let reads = 0
  walk(program, (node, parent) => {
    if (
      node.type !== 'Identifier' ||
      parent?.type === 'ImportSpecifier' ||
      parent?.type === 'ImportDefaultSpecifier' ||
      parent?.type === 'ImportNamespaceSpecifier' ||
      // A property name, not a read of the binding
      (parent?.type === 'MemberExpression' &&
        parent.property === node &&
        !parent.computed) ||
      (parent?.type === 'Property' &&
        parent.key === node &&
        !parent.computed &&
        !parent.shorthand)
    ) {
      return
    }
    if (locals.has(node.name)) {
      reads++
    } else if (namespaces.has(node.name)) {
      const member =
        parent?.type === 'MemberExpression' && parent.object === node
          ? parent.computed
            ? parent.property.type === 'Literal'
              ? String(parent.property.value)
              : undefined
            : parent.property.name
          : undefined
      if (name === undefined || member === undefined || member === name) {
        reads++
      }
    }
  })
  return reExports || reads > 0
}

const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])

/**
 * For each function of a served module whose own body (nested functions
 * left out) holds a string `marker`: the directive its body starts with,
 * if any. Name- and form-independent (a declaration, an expression, an
 * arrow with a block body).
 */
export function directivesOfFunctionsHolding(code: string, marker: string) {
  const { program } = parseSync('module.js', code, { sourceType: 'module' })
  const found: Array<string | undefined> = []
  walk(program, (node) => {
    if (!functionTypes.has(node.type) || node.body?.type !== 'BlockStatement') {
      return
    }
    let holds = false as boolean
    const visitOwn = (value: unknown) => {
      if (!value || typeof value !== 'object') {
        return
      }
      if (Array.isArray(value)) {
        value.forEach(visitOwn)
        return
      }
      const child = value as Node
      if (functionTypes.has(child.type)) {
        return
      }
      if (child.type === 'Literal' && child.value === marker) {
        holds = true
      }
      for (const key of Object.keys(child)) {
        if (key !== 'type' && key !== 'start' && key !== 'end') {
          visitOwn(child[key])
        }
      }
    }
    visitOwn(node.body.body)
    if (holds) {
      const [first] = node.body.body as Array<Node>
      found.push(
        first?.type === 'ExpressionStatement' ? first.directive : undefined,
      )
    }
  })
  return found
}
