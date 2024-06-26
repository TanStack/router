import * as babel from '@babel/core'

export const compilePlugins: Array<babel.PluginItem> = [
  ['@babel/plugin-syntax-jsx', {}],
  [
    '@babel/plugin-syntax-typescript',
    {
      isTSX: true,
    },
  ],
]

export type ParseAstOpts = {
  code: string
  filename: string
  root: string
}

export function parseAst(opts: ParseAstOpts): babel.ParseResult | null {
  return babel.parse(opts.code, {
    plugins: [...compilePlugins],
    root: opts.root,
    filename: opts.filename,
    sourceMaps: true,
    sourceType: 'module',
  })
}
