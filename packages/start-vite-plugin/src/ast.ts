import * as babel from '@babel/core'

export type CompileFn = (compileOpts: {
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
        ['@babel/plugin-syntax-jsx', {}],
        [
          '@babel/plugin-syntax-typescript',
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
