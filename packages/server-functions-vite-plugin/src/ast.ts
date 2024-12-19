import { parse } from '@babel/parser'
import type { ParseResult } from '@babel/parser'

export type ParseAstOptions = {
  code: string
  filename: string
  root: string
}

export function parseAst(opts: ParseAstOptions): ParseResult<babel.types.File> {
  return parse(opts.code, {
    plugins: ['jsx', 'typescript'],
    sourceType: 'module',
    ...{
      root: opts.root,
      filename: opts.filename,
      sourceMaps: true,
    },
  })
}
