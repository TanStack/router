/**
 * Parsing. One Yuku parse with the semantic model
 * per (env, module id, input text); the `SourceFile` lives only for the
 * compile attempt (nothing cached may reach a Yuku object).
 */
import { CHILD_KEYS, parse } from 'yuku'
import { SourceText } from './output-builder'
import type { Node, SourceFile } from 'yuku'
import type { Lang } from './identity'
import type { Diagnostic } from './diagnostics'
import type { Range } from './header'

export { SourceText } from './output-builder'
export { langFromId } from './identity'

type ParsedModule =
  | { ok: true; file: SourceFile; source: SourceText }
  | { ok: false; source: SourceText; diagnostics: Array<Diagnostic> }

export interface ParseModuleOptions {
  lang: Lang
  /** Defaults from the path extension (`.cjs`/`.cts` → commonjs). */
  sourceType?: 'module' | 'script' | 'commonjs'
  /** The path (query stripped) the diagnostics and Yuku's defaults use. */
  path?: string
  /** Build the semantic model (default true). Tier-0-only parses may skip it. */
  semantic?: boolean
}

export function parseModule(
  code: string,
  opts: ParseModuleOptions,
): ParsedModule {
  const source = new SourceText(code)
  const file = parse(code, {
    lang: opts.lang,
    sourceType: opts.sourceType,
    path: opts.path,
    analyze: opts.semantic !== false,
    preserveParens: true,
  })
  const errors = file.diagnostics.filter((d) => d.severity === 'error')
  if (errors.length > 0) {
    return {
      ok: false,
      source,
      diagnostics: errors.map((d) => ({
        severity: 'error' as const,
        message: d.message,
        range: { start: d.start, end: d.end },
        by: 'parse',
      })),
    }
  }
  return { ok: true, file, source }
}

/** The node types `isExpressionWrapper` accepts. */
type ExpressionWrapper = Extract<
  Node,
  {
    type:
      | 'ParenthesizedExpression'
      | 'TSAsExpression'
      | 'TSSatisfiesExpression'
      | 'TSNonNullExpression'
      | 'TSTypeAssertion'
      | 'TSInstantiationExpression'
      | 'ChainExpression'
  }
>

/**
 * Whether `node` is transparent to the value it wraps: parentheses, the
 * TypeScript expression wrappers (`x as T`, `x satisfies T`, `x!`, `<T>x`,
 * `f<T>`) and the `ChainExpression` around an optional chain. Yuku's own
 * `unwrap` stops at instantiation expressions and chains.
 */
export function isExpressionWrapper(node: Node): node is ExpressionWrapper {
  switch (node.type) {
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
    case 'TSInstantiationExpression':
    case 'ChainExpression':
      return true
    default:
      return false
  }
}

/** Calls `fn` on each child node of `node` (Yuku's `CHILD_KEYS`, in source order). */
export function forEachChild(node: Node, fn: (child: Node) => void): void {
  const fields = node as unknown as Record<string, unknown>
  for (const key of CHILD_KEYS[node.type] ?? []) {
    const value = fields[key] as Node | ReadonlyArray<Node | null> | null
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null) {
          fn(item)
        }
      }
    } else if (value != null) {
      fn(value as Node)
    }
  }
}

/** The expression inside every wrapper (`isExpressionWrapper`) around `node`, or `node` itself. */
export function unwrapExpression(node: Node): Node {
  let n = node
  while (isExpressionWrapper(n)) {
    n = n.expression
  }
  return n
}

/** The identifiers a binding pattern declares, in source order. */
export function patternIdentifiers(
  p: Node,
): Array<Extract<Node, { type: 'Identifier' }>> {
  switch (p.type) {
    case 'Identifier':
      return [p]
    case 'ArrayPattern':
      return p.elements.flatMap((e) => (e ? patternIdentifiers(e) : []))
    case 'ObjectPattern':
      return p.properties.flatMap((prop) =>
        prop.type === 'RestElement'
          ? patternIdentifiers(prop.argument)
          : patternIdentifiers(prop.value),
      )
    case 'AssignmentPattern':
      return patternIdentifiers(p.left)
    case 'RestElement':
      return patternIdentifiers(p.argument)
    default:
      return []
  }
}

const IDENTIFIER_NAME =
  /(?:[\p{ID_Continue}$\u200c\u200d]|\\u[\da-fA-F]{4}|\\u\{[\da-fA-F]+\})+/uy

/**
 * The range of a binding's name as written: an identifier's own range holds
 * its annotation (`comp: FC`, `b!: T`, as in every TypeScript AST) and an
 * escaped name is longer than its value.
 */
export function bindingNameRange(
  code: string,
  id: Extract<Node, { type: 'Identifier' }>,
): Range {
  if (id.end - id.start === id.name.length) {
    return { start: id.start, end: id.end }
  }
  IDENTIFIER_NAME.lastIndex = id.start
  IDENTIFIER_NAME.test(code)
  return { start: id.start, end: IDENTIFIER_NAME.lastIndex }
}

/** The name a namespace declares: `A` of `namespace A` and of `namespace A.B.C`; a `declare module 'x'` has none. */
export function namespaceName(decl: {
  id: Node
}): Extract<Node, { type: 'Identifier' }> | null {
  let id = decl.id
  while (id.type === 'TSQualifiedName') {
    id = id.left
  }
  return id.type === 'Identifier' ? id : null
}

/** The offset of the next token at or after `pos` (past whitespace and comments), or the end of the code. */
export function nextToken(code: string, pos: number): number {
  let i = pos
  while (i < code.length) {
    const c = code[i]!
    if (/\s/.test(c)) {
      i++
    } else if (code.startsWith('//', i)) {
      const nl = code.slice(i).search(/[\n\r\u2028\u2029]/)
      i = nl === -1 ? code.length : i + nl
    } else if (code.startsWith('/*', i)) {
      const close = code.indexOf('*/', i + 2)
      i = close === -1 ? code.length : close + 2
    } else {
      break
    }
  }
  return i
}

/** The names a declaration statement declares. */
export function declaredNames(
  decl: Node,
): Array<Extract<Node, { type: 'Identifier' }>> {
  switch (decl.type) {
    case 'VariableDeclaration': {
      const out: Array<Extract<Node, { type: 'Identifier' }>> = []
      for (const d of decl.declarations) {
        for (const id of patternIdentifiers(d.id)) {
          out.push(id)
        }
      }
      return out
    }
    case 'FunctionDeclaration':
    case 'TSDeclareFunction':
    case 'ClassDeclaration':
    case 'TSEnumDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSInterfaceDeclaration':
      return decl.id ? [decl.id] : []
    case 'TSImportEqualsDeclaration':
      return [decl.id]
    case 'TSModuleDeclaration': {
      const id = namespaceName(decl)
      return id === null ? [] : [id]
    }
    default:
      return []
  }
}
