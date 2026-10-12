export {
  analyzeModule,
  generateModule,
  filePragmas,
  keepFilePragmas,
  unwrapExport,
  cloneModuleAst,
  cloneGeneratedNode,
  parseStatements,
  parseExpression,
  linkGeneratedReference,
  generatedReferenceOf,
  prependStatements,
  sourcePosition,
} from './ast'
export type { AnalyzeModuleOptions, GenerateResult } from './ast'
export { logDiff } from './logger'
export { copyFilesPlugin } from './copy-files-plugin'
export { createIdentifier, decodeIdentifier } from './path-ids'
export {
  collectModuleReferences,
  extractModuleInfo,
  importedNameOf,
  unwrapExpression,
  moduleDeclarationGraph,
  expandTransitively,
  prepareBindingCleanup,
  removeUnusedBindings,
} from './compiler-helpers'
export type { ImportedName, ModuleInfoBinding } from './compiler-helpers'
