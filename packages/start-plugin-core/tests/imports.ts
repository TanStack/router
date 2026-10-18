/**
 * Reads the imports of a compiled module (static, dynamic and re-export
 * requests) from its AST. Re-exported by `regression-helpers.ts`.
 */
import { parseSync } from 'vite'
import type { ESTree } from 'vite'

export type Node = { type: string; [key: string]: unknown }

export function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Node).type === 'string'
  )
}

/** The static value of a module specifier expression, if any. */
export function staticSpecifier(node: unknown) {
  if (!isNode(node)) {
    return undefined
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (
    node.type === 'TemplateLiteral' &&
    (node.expressions as Array<unknown>).length === 0
  ) {
    const [quasi] = node.quasis as Array<{ value: { cooked: string } }>
    return quasi!.value.cooked
  }
  return undefined
}

export function walk(node: unknown, visit: (node: Node) => void) {
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, visit)
    }
    return
  }
  if (!isNode(node)) {
    return
  }
  visit(node)
  for (const key in node) {
    if (key !== 'type') {
      walk(node[key], visit)
    }
  }
}

/** Name an import or export specifier refers to. */
function specifierName(node: unknown) {
  if (!isNode(node)) {
    return undefined
  }
  return node.type === 'Identifier'
    ? (node.name as string)
    : (node.value as string)
}

interface ModuleRequests {
  /** Source of each import and re-export declaration, in source order. */
  declarations: Array<string>
  /** Specifiers of static imports and re-exports, unique, in source order. */
  static: Array<string>
  /** Static specifiers of dynamic `import()` calls, in source order. */
  dynamic: Array<string>
  /** Names imported or re-exported from each static specifier. */
  names: Map<string, Set<string>>
}

/**
 * Parses a module as TypeScript with JSX, or else as TypeScript (where
 * `<T>value` is a type assertion).
 */
export function parseModule(code: string): ESTree.Program {
  const tsx = parseSync('module.tsx', code, { sourceType: 'module' })
  if (tsx.errors.length === 0) {
    return tsx.program
  }
  const ts = parseSync('module.ts', code, { sourceType: 'module' })
  if (ts.errors.length === 0) {
    return ts.program
  }
  throw new Error(`Cannot parse module: ${tsx.errors[0]!.message}\n${code}`)
}

/** The modules a JavaScript or TypeScript (JSX) module requests. */
export function moduleRequests(code: string) {
  const program = parseModule(code)
  const requests: ModuleRequests = {
    declarations: [],
    static: [],
    dynamic: [],
    names: new Map(),
  }
  const declare = (specifier: string) => {
    requests.declarations.push(specifier)
    request(specifier)
  }
  const request = (specifier: string, name?: string) => {
    if (!requests.names.has(specifier)) {
      requests.static.push(specifier)
      requests.names.set(specifier, new Set())
    }
    if (name !== undefined) {
      requests.names.get(specifier)!.add(name)
    }
  }
  walk(program, (node) => {
    switch (node.type) {
      case 'ImportDeclaration': {
        const source = staticSpecifier(node.source)!
        declare(source)
        for (const specifier of node.specifiers as Array<Node>) {
          if (specifier.type === 'ImportDefaultSpecifier') {
            request(source, 'default')
          } else if (specifier.type === 'ImportSpecifier') {
            request(source, specifierName(specifier.imported))
          }
        }
        break
      }
      case 'ExportNamedDeclaration': {
        const source = staticSpecifier(node.source)
        if (source !== undefined) {
          declare(source)
          for (const specifier of node.specifiers as Array<Node>) {
            request(source, specifierName(specifier.local))
          }
        }
        break
      }
      case 'ExportAllDeclaration':
        declare(staticSpecifier(node.source)!)
        break
      case 'ImportExpression': {
        const source = staticSpecifier(node.source)
        if (source !== undefined) {
          requests.dynamic.push(source)
        }
        break
      }
    }
  })
  return requests
}

/**
 * Project-local sources of a module's import and re-export declarations
 * (one per declaration), sorted.
 */
export function importSources(code: string) {
  return moduleRequests(code)
    .declarations.filter((source) => !source.startsWith('@tanstack/'))
    .sort()
}
