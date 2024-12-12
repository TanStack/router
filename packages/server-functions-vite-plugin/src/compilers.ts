import * as babel from '@babel/core'
import generate from '@babel/generator'
import { codeFrameColumns } from '@babel/code-frame'
import { deadCodeElimination } from 'babel-dead-code-elimination'

import { parseAst } from './ast'
import type { ParseAstOptions } from './ast'

export function compileEliminateDeadCode(opts: ParseAstOptions) {
  const ast = parseAst(opts)
  deadCodeElimination(ast)

  return generate(ast, {
    sourceMaps: true,
  })
}

const debug = process.env.TSR_VITE_DEBUG === 'true'

export function compileServerFnClient(opts: ParseAstOptions) {
  const ast = parseAst(opts)

  const serverFnPaths: Array<babel.NodePath> = []

  babel.traverse(ast, {
    Program: {
      enter(programPath) {
        programPath.traverse({
          enter(path) {
            // Check for 'use server' directive in function declarations (named functions)
            if (path.isFunctionDeclaration()) {
              const directives = path.node.body.directives
              for (const directive of directives) {
                if (directive.value.value === 'use server') {
                  serverFnPaths.push(path)
                }
              }
            }

            // Check for 'use server' directive in function expressions (anonymous functions)
            if (path.isFunctionExpression()) {
              const directives = path.node.body.directives
              for (const directive of directives) {
                if (directive.value.value === 'use server') {
                  serverFnPaths.push(path)
                }
              }
            }

            // Check for 'use server' directive in arrow functions
            if (path.isArrowFunctionExpression()) {
              if (babel.types.isBlockStatement(path.node.body)) {
                const directives = path.node.body.directives
                for (const directive of directives) {
                  if (directive.value.value === 'use server') {
                    serverFnPaths.push(path)
                  }
                }
              }
            }

            // Check for 'use server' directive in class methods
            if (path.isClassMethod()) {
              const directives = path.node.body.directives
              for (const directive of directives) {
                if (directive.value.value === 'use server') {
                  serverFnPaths.push(path)
                }
              }
            }

            // Check for 'use server' directive in object methods
            if (path.isObjectMethod()) {
              const directives = path.node.body.directives
              for (const directive of directives) {
                if (directive.value.value === 'use server') {
                  serverFnPaths.push(path)
                }
              }
            }

            // Check for 'use server' directive in variable declarations with function expressions
            if (
              path.isVariableDeclarator() &&
              (babel.types.isFunctionExpression(path.node.init) ||
                babel.types.isArrowFunctionExpression(path.node.init))
            ) {
              const init = path.node.init
              if (babel.types.isBlockStatement(init.body)) {
                const directives = init.body.directives
                for (const directive of directives) {
                  if (directive.value.value === 'use server') {
                    serverFnPaths.push(path.get('init') as babel.NodePath)
                  }
                }
              }
            }

            return serverFnPaths
          },
        })
      },
    },
  })

  const compiledCode = generate(ast, {
    sourceMaps: true,
    minified: process.env.NODE_ENV === 'production',
  })

  console.log(serverFnPaths)

  return {
    compiledCode,
    serverFns: serverFnPaths,
  }
}

export function compileServerFnServer(opts: ParseAstOptions) {
  const ast = parseAst(opts)

  return generate(ast, {
    sourceMaps: true,
    minified: process.env.NODE_ENV === 'production',
  })
}

function codeFrameError(
  code: string,
  loc: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  },
  message: string,
) {
  const frame = codeFrameColumns(
    code,
    {
      start: loc.start,
      end: loc.end,
    },
    {
      highlightCode: true,
      message,
    },
  )

  return new Error(frame)
}
