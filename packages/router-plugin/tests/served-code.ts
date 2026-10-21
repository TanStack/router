/**
 * Independent observers of code as the dev server serves it to the page
 * (SYNTHESIS P8): an Oxc parse of the served JavaScript, for the few checks
 * that SPEC states on modules (D5 dependency absence, directives), never
 * on generated names, layout or printing.
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
 * Whether a served module reads the binding `name` that it imports from
 * `request` (an unused import specifier is free, SPEC §5.9; reading it
 * would carry the code that reads it).
 */
export function readsImport(code: string, request: string, name: string) {
  const { program } = parseSync('module.js', code, { sourceType: 'module' })
  const locals = new Set<string>()
  for (const statement of program.body as Array<Node>) {
    if (
      statement.type === 'ImportDeclaration' &&
      String(statement.source.value).split('?')[0] === request
    ) {
      for (const specifier of statement.specifiers as Array<Node>) {
        if (
          specifier.type === 'ImportSpecifier' &&
          (specifier.imported.name ?? specifier.imported.value) === name
        ) {
          locals.add(specifier.local.name)
        }
      }
    }
  }
  let reads = 0
  walk(program, (node, parent) => {
    if (
      node.type === 'Identifier' &&
      locals.has(node.name) &&
      parent?.type !== 'ImportSpecifier'
    ) {
      reads++
    }
  })
  return reads > 0
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
