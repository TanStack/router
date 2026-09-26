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
    throw new SyntaxError(`${filename}: ${error.message} (at ${error.start})`)
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
}

export function cloneModuleAst(module: Module): ModuleAstClone {
  const program = structuredClone(module.ast)
  const originals: Array<Node> = []
  walk(module.ast, {
    enter(node) {
      originals.push(node)
    },
  })
  const originalNodes = new WeakMap<Node, Node>()
  let index = 0
  walk(program, {
    enter(node) {
      originalNodes.set(node, originals[index++]!)
    },
  })
  return { program, originalNodes }
}

const generatedReferences = new WeakMap<Node, Symbol | string>()

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
  const copy = structuredClone(node)
  const originals: Array<Node> = []
  walk(node, {
    enter(original) {
      originals.push(original)
    },
  })
  let index = 0
  walk(copy, {
    enter(current) {
      const reference = generatedReferences.get(originals[index++]!)
      if (reference) {
        generatedReferences.set(current, reference)
      }
    },
  })
  return copy
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
