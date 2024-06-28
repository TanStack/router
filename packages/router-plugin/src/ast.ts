import * as babel from '@babel/core'
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

export type CompileAstFn = (compileOpts: {
  code: string
  filename: string
  getBabelConfig: () => { plugins: Array<any> }
}) => Promise<{
  code: string
  map: any
}>

export function compileAst(makeOpts: { root: string }) {
  return async (opts: {
    code: string
    filename: string
    getBabelConfig: () => { plugins: Array<any> }
  }): Promise<{
    code: string
    map: any
  }> => {
    const res = babel.transformSync(opts.code, {
      plugins: [
        babelPluginJsx,
        [
          babelPluginTypeScript,
          {
            isTSX: true,
          },
        ],
        ...opts.getBabelConfig().plugins,
      ],
      root: makeOpts.root,
      filename: opts.filename,
      sourceMaps: true,
    })

    if (res?.code) {
      return {
        code: res.code,
        map: res.map,
      }
    }

    return {
      code: opts.code,
      map: null,
    }
  }
}
