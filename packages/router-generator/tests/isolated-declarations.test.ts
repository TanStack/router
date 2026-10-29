import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { expect, it, onTestFinished } from 'vitest'
import { Generator, getConfig } from '../src'
import type { Config } from '../src'

const typedFixtures: Record<string, Partial<Config>> = {
  'isolated-declarations-flat': {},
  'isolated-declarations-nested': {},
  'isolated-declarations-pathless-layout': {},
  'isolated-declarations-lazy': {},
  'isolated-declarations-unformatted': { enableRouteTreeFormatting: false },
}

function tsPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}

function fixtureDirectory(fixture: string) {
  return tsPath(path.join(process.cwd(), 'tests', 'generator', fixture))
}

async function generateTree(
  fixture: string,
  variant: 'isolated' | 'inferred',
  options: Partial<Config> = {},
) {
  const root = fixtureDirectory(fixture)
  const generatedRouteTree = tsPath(
    path.join(
      root,
      `routeTree.${variant}.gen.${options.disableTypes ? 'js' : 'ts'}`,
    ),
  )
  onTestFinished(() => rm(generatedRouteTree, { force: true }))
  const config = getConfig({
    disableLogging: true,
    routesDirectory: path.join(root, 'routes'),
    generatedRouteTree,
    isolatedDeclarations: variant === 'isolated',
    ...typedFixtures[fixture],
    ...options,
  })
  await new Generator({ config, root }).run()
  return generatedRouteTree
}

it.each(Object.keys(typedFixtures))(
  'the "%s" route tree compiles with isolatedDeclarations and keeps its type',
  async (fixture) => {
    const isolatedFile = await generateTree(fixture, 'isolated')
    const inferredFile = await generateTree(fixture, 'inferred')
    const checkFile = tsPath(
      path.join(fixtureDirectory(fixture), 'route-tree-types.check.ts'),
    )
    const checkSource = `
import { routeTree as isolated } from './routeTree.isolated.gen'
import { routeTree as inferred } from './routeTree.inferred.gen'
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
      [isolatedFile, inferredFile, checkFile],
      compilerOptions,
      host,
    )
    const isolatedTree = program.getSourceFile(isolatedFile)!
    const inferredTree = program.getSourceFile(inferredFile)!
    expect(isolatedTree.text).not.toContain('@ts-nocheck')
    expect(inferredTree.text).not.toContain('@ts-nocheck')
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
      const fileName = file
        ? path.relative(fixtureDirectory(fixture), file.fileName)
        : '<program>'
      return `${fileName}:${line} TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
    })
    const inferredDeclarationCodes = program
      .getDeclarationDiagnostics(inferredTree)
      .map((diagnostic) => diagnostic.code)

    expect(errors).toEqual([])
    expect(inferredDeclarationCodes).toContain(9010)
  },
  60_000,
)

it('is a no-op with disableTypes', async () => {
  const fixture = 'isolated-declarations-types-disabled'
  const isolatedFile = await generateTree(fixture, 'isolated', {
    disableTypes: true,
  })
  const inferredFile = await generateTree(fixture, 'inferred', {
    disableTypes: true,
  })
  const isolatedText = await readFile(isolatedFile, 'utf-8')
  const inferredText = await readFile(inferredFile, 'utf-8')

  expect(isolatedText).toBe(inferredText)
})
