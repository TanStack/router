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

/**
 * Whether `node` is transparent to the value it wraps: parentheses, the
 * TypeScript expression wrappers (`x as T`, `x satisfies T`, `x!`, `<T>x`,
 * `f<T>`) and the `ChainExpression` around an optional chain. Yuku's own
 * `unwrap` stops at instantiation expressions and chains.
 */
export function isExpressionWrapper(node: Node): boolean {
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
  for (;;) {
    switch (n.type) {
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
      case 'TSInstantiationExpression':
      case 'ChainExpression':
        n = n.expression
        continue
      default:
        return n
    }
  }
}

/** A property's key when the source spells it (`a`, `'a'`, `['a']`, `1`), else null. */
export function propertyKeyName(prop: Node): string | null {
  if (prop.type !== 'Property') {
    return null
  }
  const key = prop.key
  if (prop.computed) {
    if (key.type === 'Literal' && typeof key.value === 'string') {
      return key.value
    }
    return null
  }
  if (key.type === 'Identifier') {
    return key.name
  }
  if (key.type === 'Literal') {
    return typeof key.value === 'string' || typeof key.value === 'number'
      ? String(key.value)
      : null
  }
  return null
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
