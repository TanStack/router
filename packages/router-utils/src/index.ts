export {
  parseAst,
  generateFromAst,
  deadCodeElimination,
  findReferencedIdentifiers,
  stripTypeExports,
} from './ast'
export type { ParseAstOptions, ParseAstResult, GeneratorResult } from './ast'
export { logDiff } from './logger'

export { copyFilesPlugin } from './copy-files-plugin'
