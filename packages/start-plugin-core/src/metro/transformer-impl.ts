import { createMetroCompiler } from './start-compiler-host'
import type {
  CreateMetroCompilerOptions,
  MetroCompilerHandle,
} from './start-compiler-host'

/**
 * The shape of the original Metro Babel transformer that we wrap.
 * We don't strictly type Metro's args/result here — different Metro versions
 * disagree on details, and we just pass them straight through after rewriting
 * `args.src`.
 */
interface OriginalTransformer {
  transform: (args: TransformArgs) => Promise<unknown> | unknown
}

interface TransformArgs {
  filename: string
  src: string
  options?: Record<string, unknown>
  plugins?: Array<unknown>
}

export interface TransformerImplOptions extends CreateMetroCompilerOptions {
  originalTransformerPath?: string
  /**
   * If provided, replaces references to `process.env.TSS_SERVER_FN_BASE` and
   * `import.meta.env.TSS_SERVER_FN_BASE` in transformed source so client RPC
   * stubs know where to send requests.
   */
  serverFnBase?: string
}

const SERVER_FN_BASE_PATTERN =
  /(?:process\.env|import\.meta\.env)\.TSS_SERVER_FN_BASE/g

export function createCompilerHandle(
  options: TransformerImplOptions,
): MetroCompilerHandle {
  return createMetroCompiler({
    framework: options.framework,
    root: options.root,
    generateFunctionId: options.generateFunctionId,
    compilerTransforms: options.compilerTransforms,
  })
}

export async function runTransform(input: {
  args: TransformArgs
  compiler: MetroCompilerHandle
  originalTransformer: OriginalTransformer
  options: TransformerImplOptions
}): Promise<unknown> {
  const { args, compiler, originalTransformer, options } = input

  let src = args.src
  let mutated = false

  const compiled = await compiler.compile({ id: args.filename, code: src })
  if (compiled) {
    src = compiled.code
    mutated = true
  }

  if (options.serverFnBase) {
    const replaced = src.replace(
      SERVER_FN_BASE_PATTERN,
      JSON.stringify(options.serverFnBase),
    )
    if (replaced !== src) {
      src = replaced
      mutated = true
    }
  }

  if (!mutated) {
    return originalTransformer.transform(args)
  }

  return originalTransformer.transform({ ...args, src })
}
