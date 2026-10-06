import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { analyze } from 'yuku-analyzer'
import { generate } from 'yuku-codegen'
import { walk } from 'yuku-ast'
import { load as loadNativeCore } from 'yuku-core'
import { loadSync as loadWasmCore } from '@yuku-core/wasm'
import type { Binding, Module } from 'yuku-analyzer'
import type { Core, Expression, Node, Program } from '@yuku-toolchain/types'
import type { GenerateResult as NativeGenerateResult } from 'yuku-codegen'

let core: Core | undefined

function getCore(): Core {
  if (!core) {
    // WebContainers (StackBlitz, bolt.new) cannot load native addons, and
    // Yuku no longer falls back to WebAssembly on its own since
    // https://github.com/yuku-toolchain/yuku/releases/tag/v0.17.0
    if (process.versions.webcontainer != null) {
      // `@yuku-core/wasm`'s `loadSync()` needs the bytes, so resolve the file
      // from whichever build runs: CJS has `__filename`, ESM has `import.meta`
      const require = createRequire(
        // @ts-ignore TS1470: `import.meta` is only read in the ESM build
        typeof __filename === 'string' ? __filename : import.meta.url,
      )
      core = loadWasmCore(
        readFileSync(require.resolve('@yuku-core/wasm/yuku-core.wasm')),
      )
    } else {
      core = loadNativeCore()
    }
  }
  return core
}

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
    core: getCore(),
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
  if (result.diagnostics.length) {
    throw new Error(
      result.diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
    )
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

const generatedReferences = new WeakMap<Node, Binding | string>()

/** Explicitly connect a new reference to a source binding; never infer local scope. */
export function linkGeneratedReference<T extends Node>(
  node: T,
  reference: Binding | string,
): T {
  generatedReferences.set(node, reference)
  return node
}

export function generatedReferenceOf(node: Node): Binding | string | undefined {
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
