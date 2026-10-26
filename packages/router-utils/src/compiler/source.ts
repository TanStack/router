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

export type ParsedModule =
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
    semantic: opts.semantic !== false,
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
