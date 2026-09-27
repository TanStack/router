import { analyze } from 'yuku-analyzer'
import { generate } from 'yuku-codegen'
import { walk } from 'yuku-ast'
import type { Module, Symbol } from 'yuku-analyzer'
import type { Expression, Node, Program } from '@yuku-toolchain/types'
import type { GenerateResult as NativeGenerateResult } from 'yuku-codegen'

export interface GenerateResult extends Omit<NativeGenerateResult, 'map'> {
  map: {
    version: number
    names: Array<string>
    sources: Array<string>
    mappings: string
    file?: string
    sourceRoot?: string
    sourcesContent?: Array<string | null>
  } | null
}

export interface AnalyzeModuleOptions {
  code: string
  filename?: string
}

/** Parse and bind once. Treat this module's AST as the immutable source model. */
export function analyzeModule({
  code,
  filename = 'input.tsx',
}: AnalyzeModuleOptions): Module {
  const physicalName = filename.replace(/[?#].*$/, '')
  const module = analyze(code, {
    path: filename,
    lang: /\.[cm]?ts$/.test(physicalName) ? 'ts' : 'tsx',
    sourceType: 'module',
    attachComments: true,
  })
  const error = module.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  )
  if (error) {
    const lines = code.slice(0, error.start).split(/\r\n|[\n\r\u2028\u2029]/)
    const loc = { line: lines.length, column: lines[lines.length - 1]!.length }
    throw Object.assign(
      new SyntaxError(
        `${filename}: ${error.message} (${loc.line}:${loc.column})`,
      ),
      { loc, pos: error.start },
    )
  }
  return module
}

/** Print an output tree without modifying the source model or its semantic tables. */
export function generateModule(
  program: Program,
  options?: { source: string; filename: string },
): GenerateResult {
  const result = generate(program, {
    comments: 'all',
    ...(options
      ? {
          sourceMap: {
            source: options.source,
            sourceFileName: options.filename,
            sourcesContent: options.source,
          },
        }
      : {}),
  })
  if (result.errors.length) {
    throw new Error(result.errors.map((error) => error.message).join('\n'))
  }
  return {
    ...result,
    map: result.map
      ? {
          version: result.map.version,
          names: result.map.names,
          sources: result.map.sources,
          mappings: result.map.mappings,
          ...(result.map.file === null ? {} : { file: result.map.file }),
          ...(result.map.sourceRoot === null
            ? {}
            : { sourceRoot: result.map.sourceRoot }),
          ...(result.map.sourcesContent === null
            ? {}
            : { sourcesContent: result.map.sourcesContent }),
        }
      : null,
  }
}

export interface ModuleAstClone {
  program: Program
  /** Resolve surviving copied nodes against the original semantic snapshot. */
  originalNodes: WeakMap<Node, Node>
  /** Find an output node from the immutable source model. */
  copiedNodes: Pick<ReadonlyMap<Node, Node>, 'get'>
}

export function cloneModuleAst(module: Module): ModuleAstClone {
  const originalNodes = new WeakMap<Node, Node>()
  const { node: program, copiedNodes } = cloneAst(module.ast, originalNodes)
  return { program, originalNodes, copiedNodes }
}

const generatedReferences = new WeakMap<Node, Symbol | string>()

/** Copy AST values and provenance together, without a recursive depth limit. */
function cloneAst<T extends Node>(
  node: T,
  originalNodes?: WeakMap<Node, Node>,
): { node: T; copiedNodes: Pick<ReadonlyMap<Node, Node>, 'get'> } {
  // This output-local lookup also tracks arrays and comment records to preserve
  // aliases. Expose only node lookup, not iteration over the bookkeeping records.
  const copies = new Map<object, any>()
  const pending: Array<Record<string, any>> = []
  const copy = (value: any): any => {
    if (value === null || typeof value !== 'object') {
      return value
    }
    const existing = copies.get(value)
    if (existing) {
      return existing
    }
    // Native regex literals carry a RegExp value as well as their raw spelling.
    const result = Array.isArray(value)
      ? new Array(value.length)
      : value instanceof RegExp
        ? new RegExp(value.source, value.flags)
        : {}
    copies.set(value, result)
    if (!(value instanceof RegExp)) {
      pending.push(value, result)
      if (typeof value.type === 'string') {
        originalNodes?.set(result as Node, value)
        const reference = generatedReferences.get(value)
        if (reference !== undefined) {
          generatedReferences.set(result as Node, reference)
        }
      }
    }
    return result
  }
  const result = copy(node)
  while (pending.length) {
    const target = pending.pop()!
    const source = pending.pop()!
    for (const key of Object.keys(source)) {
      const value = copy(source[key])
      if (key === '__proto__') {
        Object.defineProperty(target, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        })
      } else {
        target[key] = value
      }
    }
  }
  return { node: result, copiedNodes: copies }
}

/** Explicitly connect a new reference to a source binding; never infer local scope. */
export function linkGeneratedReference<T extends Node>(
  node: T,
  reference: Symbol | string,
): T {
  generatedReferences.set(node, reference)
  return node
}

export function generatedReferenceOf(node: Node): Symbol | string | undefined {
  return generatedReferences.get(node)
}

/** Copy a generated fragment without dropping its native reference provenance. */
export function cloneGeneratedNode<T extends Node>(node: T): T {
  return cloneAst(node).node
}

/** Parse compiler-owned snippets; their nodes have no original-source spans. */
export function parseStatements(code: string): Program['body'] {
  const module = analyzeModule({ code, filename: 'generated.tsx' })
  for (const reference of module.unresolvedReferences) {
    if (!reference.inTypePosition) {
      generatedReferences.set(reference.node, reference.name)
    }
  }
  walk(module.ast, {
    enter(node) {
      node.start = 0
      node.end = 0
    },
  })
  return module.ast.body
}

export function parseExpression(code: string): Expression {
  const statement = parseStatements(`(${code});`)[0]
  if (statement?.type !== 'ExpressionStatement') {
    throw new Error('Expected an expression')
  }
  return statement.expression.type === 'ParenthesizedExpression'
    ? statement.expression.expression
    : statement.expression
}
