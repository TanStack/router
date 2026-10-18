/**
 * Shared test helper: type-checks an app with the real TypeScript compiler
 * and the real router package types, like `tsc --noEmit` in a project.
 */
import { symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

/** The packages this package's tests may use (the router packages, React). */
const nodeModules = path.resolve(import.meta.dirname, '../node_modules')

/**
 * Writes `code` to `file` (path relative to the app root) and type-checks it,
 * with the modules it imports (such as the route tree and the route files),
 * in a strict project resolving packages from this package's dependencies.
 * Returns the type errors, each as `<file>: <message>`.
 */
export async function typeErrorsOf(root: string, file: string, code: string) {
  await symlink(nodeModules, path.join(root, 'node_modules'), 'junction').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') {
        throw error
      }
    },
  )
  await writeFile(path.join(root, file), code)
  const program = ts.createProgram([path.join(root, file)], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    types: [],
  })
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    )
    return diagnostic.file
      ? `${path.relative(root, diagnostic.file.fileName)}: ${message}`
      : message
  })
}

/**
 * Type-level assertions for checked code: `Expect<Equal<A, B>>` is a type
 * error unless A and B are the same type.
 */
export const typeAssertions = `type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type Expect<T extends true> = T
`
