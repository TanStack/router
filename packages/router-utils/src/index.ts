export {
  analyzeModule,
  generateModule,
  keepFilePragmas,
  unwrapExport,
  cloneModuleAst,
  cloneGeneratedNode,
  parseStatements,
  parseExpression,
  linkGeneratedReference,
  prependStatements,
  sourcePosition,
} from './ast'
export type {
  AnalyzeModuleOptions,
  ModuleAstClone,
  GenerateResult,
} from './ast'
export { logDiff } from './logger'
export { copyFilesPlugin } from './copy-files-plugin'
export { createIdentifier, decodeIdentifier } from './path-ids'
export {
  collectModuleReferences,
  extractModuleInfo,
  unwrapExpression,
  moduleDeclarationGraph,
  expandTransitively,
  stripTypeExports,
  removeUnusedBindings,
} from './compiler-helpers'
export type {
  ModuleDeclarationGraph,
  RemoveUnusedBindingsOptions,
  ExtractedModuleInfo,
  ModuleInfoBinding,
} from './compiler-helpers'
