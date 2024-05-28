import * as babel from '@babel/core'
import * as t from '@babel/types'
import { eliminateUnreferencedIdentifiers } from './eliminateUnreferencedIdentifiers'

type SplitModulesById = Record<
  string,
  { id: string; node: t.FunctionExpression }
>

interface State {
  filename: string
  opts: {
    minify: boolean
    root: string
  }
  imported: Record<string, boolean>
  refs: Set<any>
  serverIndex: number
  splitIndex: number
  splitModulesById: SplitModulesById
}

export type CompileFn = (compileOpts: {
  code: string
  filename: string
  getBabelConfig: () => { plugins: Array<any> }
}) => Promise<{
  code: string
  map: any
}>

export function makeCompile(makeOpts: { root: string }) {
  return async (opts: {
    code: string
    filename: string
    getBabelConfig: () => { plugins: Array<any> }
  }): Promise<{
    code: string
    map: any
  }> => {
    const res = await babel.transform(opts.code, {
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

export async function compileFile(opts: {
  code: string
  compile: CompileFn
  filename: string
}) {
  return await opts.compile({
    code: opts.code,
    filename: opts.filename,
    getBabelConfig: () => ({
      plugins: [
        [
          {
            visitor: {
              Program: {
                enter(programPath: babel.NodePath<t.Program>, state: State) {
                  programPath.traverse(
                    {
                      CallExpression: (path) => {
                        if (path.node.callee.type === 'Identifier') {
                          if (path.node.callee.name === 'createServerFn') {
                            // If the function at createServerFn(_, MyFunc) doesn't have a
                            // 'use server' directive at the top of the function scope,
                            // then add it.

                            const fn = path.node.arguments[1]

                            if (
                              t.isFunctionExpression(fn) ||
                              t.isArrowFunctionExpression(fn)
                            ) {
                              if (t.isBlockStatement(fn.body)) {
                                const hasUseServerDirective =
                                  fn.body.directives.some((directive) => {
                                    return (
                                      directive.value.value === 'use server'
                                    )
                                  })

                                if (!hasUseServerDirective) {
                                  fn.body.directives.unshift(
                                    t.directive(
                                      t.directiveLiteral('use server'),
                                    ),
                                  )
                                }
                              }
                            }
                          }
                        }
                      },
                    },
                    state,
                  )

                  eliminateUnreferencedIdentifiers(programPath)
                },
              },
            },
          },
          {
            root: process.cwd(),
            minify: process.env.NODE_ENV === 'production',
          },
        ],
      ].filter(Boolean),
    }),
  })
}
