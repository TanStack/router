import { parse } from '@babel/parser'
import _generate from '@babel/generator'
import type { ParseResult } from '@babel/parser'
import type * as _babel_types from '@babel/types'

export type ParseAstOptions = {
  code: string
  filename: string
  root: string
  env?: 'server' | 'client' | 'ssr'
}

export function parseAst(
  opts: ParseAstOptions,
): ParseResult<_babel_types.File> {
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

let generate = _generate

if ('default' in generate) {
  generate = generate.default as typeof generate
}

export { generate as generateFromAst }
export type { GeneratorResult } from '@babel/generator'
