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
export type { AnalyzeModuleOptions, GenerateResult } from './ast'
export { logDiff } from './logger'
export { copyFilesPlugin } from './copy-files-plugin'
export { createIdentifier, decodeIdentifier } from './path-ids'
export {
  collectModuleReferences,
  extractModuleInfo,
  unwrapExpression,
  moduleDeclarationGraph,
  expandTransitively,
  removeUnusedBindings,
} from './compiler-helpers'
export type { ModuleInfoBinding } from './compiler-helpers'
