import path from 'node:path'
import * as ts from 'typescript'
import { expect, it } from 'vitest'

function tsPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}

function fixtureDirectory(fixture: string) {
  return tsPath(path.join(process.cwd(), 'tests', 'generator', fixture))
}

it.each(['nested', 'lazy', 'lazy-only-layout-and-index'])(
  'the "%s" route tree compiles with isolatedDeclarations',
  (fixture) => {
    const compareTypes = fixture !== 'lazy-only-layout-and-index'
    const root = fixtureDirectory(fixture)
    const isolatedFile = tsPath(
      path.join(root, 'routeTree.isolated.snapshot.ts'),
    )
    const inferredFile = tsPath(path.join(root, 'routeTree.snapshot.ts'))
    const checkFile = tsPath(path.join(root, 'route-tree-types.check.ts'))
    const checkSource = `
import { routeTree as isolated } from './routeTree.isolated.snapshot'
import { routeTree as inferred } from './routeTree.snapshot'
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
export const sameRouteTreeType: Equals<typeof isolated, typeof inferred> = true
`
    const compilerOptions: ts.CompilerOptions = {
      declaration: true,
      isolatedDeclarations: true,
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    }
    const host = ts.createCompilerHost(compilerOptions)
    const readSource = host.readFile
    const fileExists = host.fileExists
    host.fileExists = (fileName) =>
      fileName === checkFile || fileExists(fileName)
    host.readFile = (fileName) => {
      if (fileName === checkFile) {
        return checkSource
      }
      const text = readSource(fileName)
      if (fileName === isolatedFile || fileName === inferredFile) {
        return text?.replace(/^\/\/ @ts-nocheck\r?\n/m, '')
      }
      return text
    }
    const program = ts.createProgram(
      compareTypes ? [isolatedFile, inferredFile, checkFile] : [isolatedFile],
      compilerOptions,
      host,
    )
    const isolatedTree = program.getSourceFile(isolatedFile)!
    expect(isolatedTree.text).not.toContain('@ts-nocheck')
    const errors = [
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSyntacticDiagnostics(),
      ...program.getSemanticDiagnostics(),
      ...program.getDeclarationDiagnostics(isolatedTree),
    ].map((diagnostic) => {
      const file = diagnostic.file
      const line =
        file && diagnostic.start !== undefined
          ? file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
          : 0
      const fileName = file ? path.relative(root, file.fileName) : '<program>'
      return `${fileName}:${line} TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
    })
    expect(errors).toEqual([])
    if (compareTypes) {
      const inferredTree = program.getSourceFile(inferredFile)!
      expect(inferredTree.text).not.toContain('@ts-nocheck')
      const inferredDeclarationCodes = program
        .getDeclarationDiagnostics(inferredTree)
        .map((diagnostic) => diagnostic.code)
      expect(inferredDeclarationCodes).toContain(9010)
    }
  },
  60_000,
)
