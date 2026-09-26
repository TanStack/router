import { analyzeModule, unwrapExpression } from '@tanstack/router-utils'
import { bindingIdentifiers, is } from 'yuku-ast'
import { buildLineIndex, indexToLineColumn } from './sourceLocation'
import { getOrCreate } from './utils'
import type * as t from '@yuku-toolchain/types'
import type { Module, Symbol } from 'yuku-analyzer'
import type { LineIndex, TransformResult } from './sourceLocation'

export type UsagePos = { line: number; column0: number }
type BoundaryEnv = 'client' | 'server'
type ImportBindingInfo = { importedLocalNames: Set<string> }
type UsageCacheKey = `${BoundaryEnv | 'post'}::${string}`

export type ImportAnalysis = {
  module: Module
  lineIndex: LineIndex
  importSourcesInOrder: Array<string>
  importSpecifierLocationIndex: Map<string, number>
  importBindingsBySource: Map<string, ImportBindingInfo>
  mockExportNamesBySource: Map<string, Array<string>>
  namedExports: Array<string>
  usageByKey: Map<UsageCacheKey, UsagePos | null>
}

function mayContainImportOrExport(code: string): boolean {
  return code.includes('import') || code.includes('export')
}

function makeTransientResult(
  code: string,
  filename?: string,
  perf?: TransformResult['perf'],
): TransformResult {
  return {
    code,
    filename,
    map: undefined,
    originalCode: undefined,
    ...(perf ? { perf } : {}),
  }
}

function getOrAnalyzeModule(result: TransformResult): Module {
  if (result.analyzedModule) {
    result.perf?.count('analysis.parseAst.cached')
    return result.analyzedModule
  }
  const startedAt = result.perf ? performance.now() : 0
  result.perf?.count('analysis.parseAst.calls')
  try {
    const module = analyzeModule({
      code: result.code,
      filename: result.filename,
    })
    result.analyzedModule = module
    return module
  } finally {
    if (result.perf) {
      result.perf.time('analysis.parseAst', startedAt)
    }
  }
}

function unwrapNode(node: t.Node): t.Node {
  return is.Expression(node) ? unwrapExpression(node) : node
}

function getModuleExportName(node: t.Identifier | t.StringLiteral): string {
  return is.Identifier(node) ? node.name : node.value
}

function getStringLiteralValueStart(node: t.StringLiteral): number {
  return node.start + 1
}

function isTypeOnlyImportDeclaration(node: t.ImportDeclaration): boolean {
  return (
    node.importKind === 'type' ||
    (node.specifiers.length > 0 &&
      node.specifiers.every(
        (specifier) =>
          is.ImportSpecifier(specifier) && specifier.importKind === 'type',
      ))
  )
}

function isTypeOnlyExportNamedDeclaration(
  node: t.ExportNamedDeclaration,
): boolean {
  return (
    node.exportKind === 'type' ||
    (!!node.source &&
      !node.declaration &&
      node.specifiers.length > 0 &&
      node.specifiers.every((specifier) => specifier.exportKind === 'type'))
  )
}

export function isValidExportName(name: string): boolean {
  return name !== 'default' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
}

function buildImportAnalysis(result: TransformResult): ImportAnalysis {
  const module = getOrAnalyzeModule(result)

  const importSourcesInOrder: Array<string> = []
  const importSpecifierLocationIndex = new Map<string, number>()
  const importBindingsBySource = new Map<string, ImportBindingInfo>()
  const memberBindingSources = new Map<Symbol, Set<string>>()
  const mockNamesBySource = new Map<string, Set<string>>()
  const namedExports = new Set<string>()

  const getBindingInfo = (source: string): ImportBindingInfo =>
    getOrCreate(importBindingsBySource, source, () => ({
      importedLocalNames: new Set<string>(),
    }))

  const addSpecifierLocation = (node: t.StringLiteral) => {
    importSourcesInOrder.push(node.value)

    const index = getStringLiteralValueStart(node)
    const prev = importSpecifierLocationIndex.get(node.value)
    if (prev == null || index < prev) {
      importSpecifierLocationIndex.set(node.value, index)
    }
  }

  const addMockName = (source: string, name: string) => {
    if (name === 'default' || name.length === 0) {
      return
    }
    getOrCreate(mockNamesBySource, source, () => new Set<string>()).add(name)
  }

  const addMemberBinding = (localName: string, source: string) => {
    const symbol = module.rootScope.find(localName)
    if (symbol) {
      getOrCreate(memberBindingSources, symbol, () => new Set<string>()).add(
        source,
      )
    }
  }

  const addNamedExport = (name: string) => {
    if (name !== 'default' && name.length > 0) {
      namedExports.add(name)
    }
  }

  const visit = (node: t.Node): void => {
    if (is.ImportDeclaration(node)) {
      const isTypeOnly = isTypeOnlyImportDeclaration(node)
      if (!isTypeOnly) {
        addSpecifierLocation(node.source)
        const source = node.source.value
        const bindingInfo = getBindingInfo(source)
        for (const specifier of node.specifiers) {
          if (is.ImportNamespaceSpecifier(specifier)) {
            bindingInfo.importedLocalNames.add(specifier.local.name)
            addMemberBinding(specifier.local.name, source)
            continue
          }

          if (is.ImportDefaultSpecifier(specifier)) {
            bindingInfo.importedLocalNames.add(specifier.local.name)
            addMemberBinding(specifier.local.name, source)
            continue
          }

          if (!is.ImportSpecifier(specifier)) {
            continue
          }
          if (specifier.importKind === 'type') {
            continue
          }

          bindingInfo.importedLocalNames.add(specifier.local.name)
          const importedName = getModuleExportName(specifier.imported)
          if (importedName !== 'default') {
            addMockName(source, importedName)
          }
        }
      }
    } else if (is.ExportNamedDeclaration(node)) {
      const isTypeOnly = isTypeOnlyExportNamedDeclaration(node)
      if (!isTypeOnly && node.source && is.StringLiteral(node.source)) {
        addSpecifierLocation(node.source)
      }

      if (!isTypeOnly && node.source?.value) {
        const source = node.source.value
        for (const specifier of node.specifiers) {
          if (!is.ExportSpecifier(specifier)) {
            continue
          }
          if (specifier.exportKind === 'type') {
            continue
          }
          addMockName(source, getModuleExportName(specifier.local))
        }
      }

      if (!isTypeOnly) {
        if (node.declaration) {
          const decl = node.declaration
          if (is.FunctionDeclaration(decl) || is.ClassDeclaration(decl)) {
            if (decl.id?.name) {
              addNamedExport(decl.id.name)
            }
          } else if (is.VariableDeclaration(decl)) {
            for (const d of decl.declarations) {
              bindingIdentifiers(d.id).forEach((id) => addNamedExport(id.name))
            }
          }
        }

        for (const specifier of node.specifiers) {
          if (!is.ExportSpecifier(specifier)) {
            continue
          }
          if (specifier.exportKind === 'type') {
            continue
          }
          const exportedName = getModuleExportName(specifier.exported)
          addNamedExport(exportedName)
        }
      }
    } else if (is.ExportAllDeclaration(node)) {
      if (node.exportKind !== 'type') {
        addSpecifierLocation(node.source)
      }
    } else if (is.ImportExpression(node)) {
      const source = unwrapNode(node.source)
      if (is.StringLiteral(source)) {
        addSpecifierLocation(source)
      }
    } else if (is.MemberExpression(node)) {
      const object = unwrapNode(node.object)
      if (is.Identifier(object)) {
        const sources = memberBindingSources.get(module.symbolOf(object)!)
        if (sources) {
          const property = node.property
          for (const source of sources) {
            if (!node.computed && is.Identifier(property)) {
              addMockName(source, property.name)
            } else if (node.computed && is.StringLiteral(property)) {
              addMockName(source, property.value)
            }
          }
        }
      }
    }
  }

  module.walk({ enter: visit })

  const mockExportNamesBySource = new Map<string, Array<string>>()
  for (const [source, names] of mockNamesBySource) {
    mockExportNamesBySource.set(source, Array.from(names).sort())
  }

  const lineIndex = result.lineIndex ?? buildLineIndex(result.code)
  result.lineIndex = lineIndex

  const analysis = {
    module,
    lineIndex,
    importSourcesInOrder,
    importSpecifierLocationIndex,
    importBindingsBySource,
    mockExportNamesBySource,
    namedExports: Array.from(namedExports).sort(),
    usageByKey: new Map(),
  }

  return analysis
}

export function getOrCreateImportAnalysis(
  result: TransformResult,
): ImportAnalysis {
  if (!result.analysis) {
    result.analysis = buildImportAnalysis(result)
  }

  return result.analysis
}

export function getImportSourcesFromResult(
  result: TransformResult,
): Array<string> {
  if (!mayContainImportOrExport(result.code)) {
    return []
  }

  return getOrCreateImportAnalysis(result).importSourcesInOrder
}

export function getImportSources(
  code: string,
  filename?: string,
  perf?: TransformResult['perf'],
): Array<string> {
  return getImportSourcesFromResult(makeTransientResult(code, filename, perf))
}

export function getImportSpecifierLocationFromResult(
  result: TransformResult,
  source: string,
): number {
  return (
    getOrCreateImportAnalysis(result).importSpecifierLocationIndex.get(
      source,
    ) ?? -1
  )
}

export function getMockExportNamesBySourceFromResult(
  result: TransformResult,
): Map<string, Array<string>> {
  return getOrCreateImportAnalysis(result).mockExportNamesBySource
}

export function getMockExportNamesBySource(
  code: string,
  filename?: string,
  perf?: TransformResult['perf'],
): Map<string, Array<string>> {
  return getMockExportNamesBySourceFromResult(
    makeTransientResult(code, filename, perf),
  )
}

export function getNamedExportsFromResult(
  result: TransformResult,
): Array<string> {
  return getOrCreateImportAnalysis(result).namedExports
}

export function getNamedExports(
  code: string,
  filename?: string,
  perf?: TransformResult['perf'],
): Array<string> {
  return getNamedExportsFromResult(makeTransientResult(code, filename, perf))
}

function isCompilerSafeBoundaryCall(
  call: t.CallExpression,
  fnNode: t.Function | t.ArrowFunctionExpression,
  envType: BoundaryEnv,
): boolean {
  const directArgument = call.arguments.some(
    (arg) => unwrapNode(arg) === fnNode,
  )
  if (!directArgument) {
    return false
  }

  const callee = unwrapNode(call.callee)

  if (is.Identifier(callee)) {
    return envType === 'client'
      ? callee.name === 'createServerOnlyFn'
      : callee.name === 'createClientOnlyFn'
  }

  if (!is.MemberExpression(callee) || callee.computed) {
    return false
  }

  if (!is.Identifier(callee.property)) {
    return false
  }

  const prop = callee.property.name
  const rootName = getCalleeRootName(callee.object)

  if (envType === 'client') {
    if (prop === 'handler') {
      return rootName === 'createServerFn' || /ServerFn$/.test(rootName ?? '')
    }

    if (prop === 'server') {
      return (
        rootName === 'createMiddleware' ||
        rootName === 'createIsomorphicFn' ||
        /Middleware$/.test(rootName ?? '')
      )
    }

    return false
  }

  if (prop === 'client') {
    return rootName === 'createIsomorphicFn'
  }

  return false
}

function getCalleeRootName(node: t.Node): string | undefined {
  node = unwrapNode(node)
  if (is.Identifier(node)) {
    return node.name
  }

  if (is.CallExpression(node)) {
    return getCalleeRootName(node.callee)
  }

  if (is.MemberExpression(node)) {
    return getCalleeRootName(node.object)
  }

  return undefined
}

function transparentParent(module: Module, node: t.Node) {
  let parent = module.parentOf(node)
  while (parent && unwrapNode(parent) === unwrapNode(node)) {
    node = parent
    parent = module.parentOf(node)
  }
  return { node, parent }
}

function isInsideCompilerSafeBoundary(
  module: Module,
  node: t.Node,
  envType: BoundaryEnv,
): boolean {
  let ancestor = module.parentOf(node)
  while (ancestor) {
    if (is.Function(ancestor)) {
      const { parent: call } = transparentParent(module, ancestor)
      if (
        is.CallExpression(call) &&
        isCompilerSafeBoundaryCall(call, ancestor, envType)
      ) {
        return true
      }
    }
    ancestor = module.parentOf(ancestor)
  }
  return false
}

function findUsagePosInAnalysis(
  result: TransformResult,
  source: string,
  envType?: BoundaryEnv,
): UsagePos | undefined {
  const analysis = getOrCreateImportAnalysis(result)
  const cacheKey: UsageCacheKey = `${envType ?? 'post'}::${source}`
  if (analysis.usageByKey.has(cacheKey)) {
    return analysis.usageByKey.get(cacheKey) ?? undefined
  }
  const module = analysis.module
  const imported =
    analysis.importBindingsBySource.get(source)?.importedLocalNames
  const symbols = new Set<Symbol>()
  for (const name of imported ?? []) {
    const symbol = module.rootScope.find(name)
    if (symbol) {
      symbols.add(symbol)
    }
  }
  let preferred: UsagePos | undefined
  let anyUsage: UsagePos | undefined
  for (const reference of module.references) {
    if (
      !reference.symbol ||
      !symbols.has(reference.symbol) ||
      reference.inTypePosition
    ) {
      continue
    }
    const node = reference.node
    if (envType && isInsideCompilerSafeBoundary(module, node, envType)) {
      continue
    }
    const { node: expression, parent } = transparentParent(module, node)
    const { line, column } = indexToLineColumn(analysis.lineIndex, node.start)
    const pos = { line, column0: column - 1 }
    const isPreferred =
      ((is.CallExpression(parent) || is.NewExpression(parent)) &&
        parent.callee === expression) ||
      (is.MemberExpression(parent) && parent.object === expression)
    if (isPreferred) {
      preferred ??= pos
    } else {
      anyUsage ??= pos
    }
    if (preferred && anyUsage) {
      break
    }
  }
  const pos = preferred ?? anyUsage ?? null
  analysis.usageByKey.set(cacheKey, pos)
  return pos ?? undefined
}

export function findPostCompileUsagePosFromResult(
  result: TransformResult,
  source: string,
): UsagePos | undefined {
  return findUsagePosInAnalysis(result, source)
}

export function findPostCompileUsagePos(
  code: string,
  source: string,
): UsagePos | undefined {
  return findPostCompileUsagePosFromResult(makeTransientResult(code), source)
}

export function findOriginalUnsafeUsagePosFromResult(
  result: TransformResult,
  source: string,
  envType: BoundaryEnv,
): UsagePos | undefined {
  return findUsagePosInAnalysis(result, source, envType)
}

export function findOriginalUnsafeUsagePos(
  code: string,
  source: string,
  envType: BoundaryEnv,
): UsagePos | undefined {
  return findOriginalUnsafeUsagePosFromResult(
    makeTransientResult(code),
    source,
    envType,
  )
}
