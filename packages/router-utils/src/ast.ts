import { parse } from '@babel/parser'
import _generate from '@babel/generator'
import type { GeneratorOptions, GeneratorResult } from '@babel/generator'
import type { ParseResult, ParserOptions } from '@babel/parser'
import type * as _babel_types from '@babel/types'

export type ParseAstOptions = ParserOptions & {
  code: string
}

export function parseAst({
  code,
  ...opts
}: ParseAstOptions): ParseResult<_babel_types.File> {
  return parse(code, {
    plugins: ['jsx', 'typescript', 'explicitResourceManagement'],
    sourceType: 'module',
    ...opts,
  })
}

let generate = _generate

if ('default' in generate) {
  generate = generate.default as typeof generate
}
type GenerateFromAstOptions = GeneratorOptions &
  Required<Pick<GeneratorOptions, 'sourceFileName' | 'filename'>>
export function generateFromAst(
  ast: _babel_types.Node,
  opts?: GenerateFromAstOptions,
): GeneratorResult {
  return generate(
    ast,
    opts
      ? { importAttributesKeyword: 'with', sourceMaps: true, ...opts }
      : undefined,
  )
}
export type { GeneratorResult } from '@babel/generator'
