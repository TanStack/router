import { parse } from '@babel/parser'
import type { ParseResult } from '@babel/parser';
import type * as  _babel_types from '@babel/types'

export type ParseAstOptions = {
  code: string
  filename: string
  root: string
  env?: 'server' | 'client' | 'ssr'
}

export function parseAst(opts: ParseAstOptions) : ParseResult<_babel_types.File> {
  return parse(opts.code, {
    plugins: ['jsx', 'typescript'],
    sourceType: 'module',
    ...{
      root: opts.root,
      filename: opts.filename,
      env: opts.env,
    },
  })
}
