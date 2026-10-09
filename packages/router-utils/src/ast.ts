import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { analyze } from 'yuku-analyzer'
import { generate } from 'yuku-codegen'
import { is, walk } from 'yuku-ast'
import { load as loadNativeCore } from 'yuku-core'
import { loadSync as loadWasmCore } from '@yuku-core/wasm'
import type { Binding, Module } from 'yuku-analyzer'
import type { Core, Expression, Node, Program } from '@yuku-toolchain/types'
import type { GenerateResult as YukuGenerateResult } from 'yuku-codegen'

let core: Core | undefined

function loadWasm(): Core {
  // `@yuku-core/wasm`'s `loadSync()` needs the bytes, so resolve the file
  // from whichever build runs. Check `import.meta` first: the CJS build
  // compiles it to `{}`, and `node -e` defines a global `__filename` in ESM
  const require = createRequire(
    // @ts-ignore TS1470: `import.meta` is only read in the ESM build
    import.meta.url ?? __filename, // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- `{}.url` in the CJS build
  )
  return loadWasmCore(
    readFileSync(require.resolve('@yuku-core/wasm/yuku-core.wasm')),
  )
}

function getCore(): Core {
  if (!core) {
    // WebContainers (StackBlitz, bolt.new) cannot load native addons, and
    // Yuku no longer falls back to WebAssembly on its own since
    // https://github.com/yuku-toolchain/yuku/releases/tag/v0.17.0
    if (process.versions.webcontainer != null) {
      core = loadWasm()
    } else {
      // Platforms without a native binary, or installs without optional
      // dependencies, use WebAssembly
      try {
        core = loadNativeCore()
      } catch (nativeError) {
        try {
          core = loadWasm()
        } catch (wasmError) {
          throw new AggregateError(
            [nativeError, wasmError],
            'Yuku could load neither its native binding nor its WebAssembly core',
          )
        }
      }
    }
  }
  return core
}

export interface GenerateResult extends Omit<YukuGenerateResult, 'map'> {
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

/** One-based line and zero-based UTF-16 column at a source offset. */
export function sourcePosition(code: string, offset: number) {
  const lines = code.slice(0, offset).split(/\r\n|[\n\r\u2028\u2029]/)
  return { line: lines.length, column: lines[lines.length - 1]!.length }
}

/** Insert statements without displacing the module's directive prologue. */
export function prependStatements(
  program: Program,
  ...statements: Program['body']
): void {
  let index = 0
  while (is.Directive(program.body[index])) {
    index++
  }
  program.body.splice(index, 0, ...statements)
}

/** Parse and bind once. Treat this module's AST as the immutable source model. */
export function analyzeModule({
  code,
  filename = 'input.tsx',
}: AnalyzeModuleOptions): Module {
  // Without the query, and a hash after the last path segment's extension (a
  // `#` may also be part of a directory name)
  const physicalName = filename.replace(/\?.*$/, '').replace(/#[^/\\]*$/, '')
  const module = analyze(code, {
    path: filename,
    // JavaScript route files may contain JSX but never TypeScript, where
    // `a < b > (c)` would be a call with type arguments
    lang: /\.[cm]?ts$/.test(physicalName)
      ? 'ts'
      : /\.[cm]?jsx?$/.test(physicalName)
        ? 'jsx'
        : 'tsx',
    sourceType: 'module',
    attachComments: true,
    core: getCore(),
  })
  const error = module.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  )
  if (error) {
    const loc = sourcePosition(code, error.start)
    throw Object.assign(
      new SyntaxError(
        `${filename}: ${error.message} (${loc.line}:${loc.column})`,
      ),
      { loc, pos: error.start },
    )
  }
  return module
}

/**
 * File-level pragmas: JSX transform configuration, React Refresh's
 * `@refresh reset`, and solid-refresh's `@refresh reload` and `@refresh skip`.
 */
const filePragma =
  /@jsx(?:Frag|ImportSource|Runtime)?\b|@refresh (?:reload|reset|skip)\b/

/** Legal comments, which minifiers keep: `/*! … *\/`, `@license`, `@preserve`. */
const legalComment = /^!|@license\b|@preserve\b/

/**
 * Pragma comments configure transforms that run after these compilers for the
 * whole file, and Oxc only reads them from the comments that lead the file. So
 * an output must start with the source's top-level pragmas: removing a
 * statement drops the comments attached to it, and inserted statements would
 * otherwise land above them. The legal comments that lead the source lead
 * every output too.
 */
export function keepFilePragmas(source: Program, output: Program): void {
  const first = output.body[0]
  const kept = source.body.flatMap(
    (statement, index) =>
      statement.comments?.filter(
        (comment) =>
          filePragma.test(comment.value) ||
          (index === 0 &&
            comment.position === 'before' &&
            legalComment.test(comment.value)),
      ) ?? [],
  )
  if (!kept.length || !first) {
    return
  }
  const values = new Set(kept.map((comment) => comment.value))
  for (const statement of output.body) {
    if (statement.comments) {
      statement.comments = statement.comments.filter(
        (comment) => !values.has(comment.value),
      )
    }
  }
  first.comments = [
    ...kept.map((comment) => ({
      ...comment,
      position: 'before' as const,
      sameLine: false,
    })),
    ...(first.comments ?? []),
  ]
}

/**
 * The declaration of an `export` statement, to replace the statement: it keeps
 * the statement's comments, such as a `#__NO_SIDE_EFFECTS__` annotation.
 */
export function unwrapExport<T extends Node>(
  statement: Node,
  declaration: T,
): T {
  if (statement !== declaration && statement.comments?.length) {
    declaration.comments = [
      ...statement.comments,
      ...(declaration.comments ?? []),
    ]
  }
  return declaration
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

/** Copy a generated fragment without dropping its source reference provenance. */
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
  if (!is.ExpressionStatement(statement)) {
    throw new Error('Expected an expression')
  }
  return is.ParenthesizedExpression(statement.expression)
    ? statement.expression.expression
    : statement.expression
}
