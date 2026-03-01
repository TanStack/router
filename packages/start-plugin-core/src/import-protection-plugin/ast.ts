import { parseAst } from '@tanstack/router-utils'

export type ParsedAst = ReturnType<typeof parseAst>

export function parseImportProtectionAst(code: string): ParsedAst {
  return parseAst({ code })
}
