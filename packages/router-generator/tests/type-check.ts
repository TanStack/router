/**
 * Shared test helper: type-checks an app with the real TypeScript compiler
 * and the real router package types, like `tsc --noEmit` in a project.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { linkDirectory } from '@tanstack/compiler-test-utils/app-directory'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'

/** The packages this package's tests may use (the router packages, React). */
const nodeModules = path.resolve(import.meta.dirname, '../node_modules')

/** The program of the last check. */
let previousProgram: ts.Program | undefined

/**
 * Parsed declarations outside the run directory (TypeScript's libraries and
 * the packages', at their real paths): no test writes them, so every program
 * shares them. The apps' own files, in the run directory, are read anew.
 * (The programs have other root files, so `oldProgram` alone reuses none.)
 */
const sharedSourceFiles = new Map<string, ts.SourceFile | undefined>()

function compilerHost(options: ts.CompilerOptions) {
  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile
  const appFiles = runDirectory().replaceAll(path.sep, '/') + '/'
  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    if (fileName.replaceAll(path.sep, '/').startsWith(appFiles)) {
      return getSourceFile(fileName, languageVersion, ...rest)
    }
    const version =
      typeof languageVersion === 'object'
        ? `${languageVersion.languageVersion}:${languageVersion.impliedNodeFormat}`
        : `${languageVersion}`
    const key = `${version}:${fileName}`
    if (!sharedSourceFiles.has(key)) {
      sharedSourceFiles.set(
        key,
        getSourceFile(fileName, languageVersion, ...rest),
      )
    }
    return sharedSourceFiles.get(key)
  }
  return host
}

/**
 * A strict program over `rootNames` and the modules they import, resolving
 * packages from the nearest `node_modules` (in a test app: this package's
 * dependencies).
 */
function createProgram(
  rootNames: Array<string>,
  lib = ['lib.es2022.d.ts', 'lib.dom.d.ts'],
) {
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    lib,
    types: [],
  }
  const program = ts.createProgram({
    rootNames,
    options,
    host: compilerHost(options),
    // (the package type definitions of the previous check are reused)
    oldProgram: previousProgram,
  })
  previousProgram = program
  return program
}

function messageOf(diagnostic: ts.Diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
}

/**
 * Writes `code` to `file` (path relative to the app root) and type-checks it,
 * with the modules it imports (such as the route tree and the route files),
 * in a strict project resolving packages from this package's dependencies.
 * Returns the type errors, each as `<file>: <message>`.
 */
export async function typeErrorsOf(root: string, file: string, code: string) {
  await linkDirectory(nodeModules, path.join(root, 'node_modules')).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') {
        throw error
      }
    },
  )
  await writeFile(path.join(root, file), code)
  const program = createProgram([path.join(root, file)])
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      diagnostic.file
        ? `${path.relative(root, diagnostic.file.fileName)}: ${messageOf(diagnostic)}`
        : messageOf(diagnostic),
    )
}

/**
 * Type-checks the given modules (absolute paths) in one program, with the
 * modules they import, like `typeErrorsOf`, but reports only the errors in
 * the given modules themselves (not in the modules they import), by module.
 */
export function typeErrorsOfModules(files: Array<string>, lib?: Array<string>) {
  const program = createProgram(files, lib)
  const errors = new Map<string, Array<string>>()
  for (const file of files) {
    const sourceFile = program.getSourceFile(file)
    errors.set(
      file,
      sourceFile
        ? [
            ...program.getSyntacticDiagnostics(sourceFile),
            ...program.getSemanticDiagnostics(sourceFile),
          ].map(messageOf)
        : ['not found'],
    )
  }
  return errors
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
