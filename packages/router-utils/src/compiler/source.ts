/**
 * Parsing. One Yuku parse with the semantic model
 * per (env, module id, input text); the `SourceFile` lives only for the
 * compile attempt (nothing cached may reach a Yuku object).
 */
import { parse } from 'yuku'
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

interface ParseModuleOptions {
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

/** The expression inside every wrapper (`isExpressionWrapper`) around `node`, or `node` itself. */
export function unwrapExpression(node: Node): Node {
  let n = node
  while (isExpressionWrapper(n)) {
    n = n.expression
  }
  return n
}

/**
 * Whether code whose first token is at `start` would, written as a
 * statement, start a block, a declaration or a `let` declaration instead of
 * an expression (`{ a: f() };`, `function () {}();`): an expression put
 * there needs parentheses.
 */
export function opensNonExpressionStatement(
  code: string,
  start: number,
): boolean {
  return /^(?:\{|function\b|class\b|async\s+function\b|let\s*\[)/.test(
    code.slice(start, start + 16),
  )
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
