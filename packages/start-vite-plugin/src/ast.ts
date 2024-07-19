import * as babel from '@babel/core'
import '@babel/parser'
// @ts-expect-error
import _babelPluginJsx from '@babel/plugin-syntax-jsx'
// @ts-expect-error
import _babelPluginTypeScript from '@babel/plugin-syntax-typescript'

let babelPluginJsx = _babelPluginJsx
let babelPluginTypeScript = _babelPluginTypeScript

if (babelPluginJsx.default) {
  babelPluginJsx = babelPluginJsx.default
}

if (babelPluginTypeScript.default) {
  babelPluginTypeScript = babelPluginTypeScript.default
}

export type ParseAstOptions = {
  code: string
  filename: string
  root: string
}

export function parseAst(opts: ParseAstOptions) {
  const babelPlugins: Array<babel.PluginItem> = [
    babelPluginJsx,
    [
      babelPluginTypeScript,
      {
        isTSX: true,
      },
    ],
  ]

  return babel.parse(opts.code, {
    plugins: babelPlugins,
    root: opts.root,
    filename: opts.filename,
    sourceMaps: true,
    sourceType: 'module',
  })
}
