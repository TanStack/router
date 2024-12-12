import path from 'node:path'
import * as babel from '@babel/core'
import _generate from '@babel/generator'
import { deadCodeElimination } from 'babel-dead-code-elimination'

import { isIdentifier, isVariableDeclarator } from '@babel/types'
import { parseAst } from './ast'
import type { ParseAstOptions } from './ast'

let generate = _generate

if ('default' in generate) {
  generate = generate.default as typeof generate
}

export function compileEliminateDeadCode(opts: ParseAstOptions) {
  const ast = parseAst(opts)
  deadCodeElimination(ast)

  return generate(ast, {
    sourceMaps: true,
  })
}

// const debug = process.env.TSR_VITE_DEBUG === 'true'

function findNearestVariableName(path: babel.NodePath): string {
  let currentPath: babel.NodePath | null = path
  const nameParts: Array<string> = []

  while (currentPath) {
    const name = (() => {
      // Check for named function expression
      if (
        babel.types.isFunctionExpression(currentPath.node) &&
        currentPath.node.id
      ) {
        return currentPath.node.id.name
      }

      // Handle method chains
      if (babel.types.isCallExpression(currentPath.node)) {
        const current = currentPath.node.callee
        const chainParts: Array<string> = []

        // Get the nearest method name (if it's a method call)
        if (babel.types.isMemberExpression(current)) {
          if (babel.types.isIdentifier(current.property)) {
            chainParts.unshift(current.property.name)
          }

          // Get the base callee
          let base = current.object
          while (!babel.types.isIdentifier(base)) {
            if (babel.types.isCallExpression(base)) {
              base = base.callee as babel.types.Expression
            } else if (babel.types.isMemberExpression(base)) {
              base = base.object
            } else {
              break
            }
          }
          if (babel.types.isIdentifier(base)) {
            chainParts.unshift(base.name)
          }
        } else if (babel.types.isIdentifier(current)) {
          chainParts.unshift(current.name)
        }

        if (chainParts.length > 0) {
          return chainParts.join('_')
        }
      }

      // Rest of the existing checks...
      if (babel.types.isFunctionDeclaration(currentPath.node)) {
        return currentPath.node.id?.name
      }

      if (babel.types.isIdentifier(currentPath.node)) {
        return currentPath.node.name
      }

      if (
        isVariableDeclarator(currentPath.node) &&
        isIdentifier(currentPath.node.id)
      ) {
        return currentPath.node.id.name
      }

      if (
        babel.types.isClassMethod(currentPath.node) ||
        babel.types.isObjectMethod(currentPath.node)
      ) {
        if (babel.types.isIdentifier(currentPath.node.key)) {
          return currentPath.node.key.name
        }
        if (babel.types.isStringLiteral(currentPath.node.key)) {
          return currentPath.node.key.value
        }
      }

      return null
    })()

    if (name) {
      nameParts.unshift(name)
    }

    currentPath = currentPath.parentPath
  }

  return nameParts.length > 0 ? nameParts.join('_') : 'anonymous'
}

function makeFileLocationUrlSafe(location: string): string {
  return location
    .replace(/[^a-zA-Z0-9-_]/g, '_') // Replace unsafe chars with underscore
    .replace(/_{2,}/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, '') // Trim leading/trailing underscores
}

export function compileServerFnClient(
  opts: ParseAstOptions & {
    getRuntimeCode: (opts: {
      serverFnPathsByFunctionId: Record<
        string,
        { nodePath: babel.NodePath; functionName: string; functionId: string }
      >
    }) => string
    replacer: (opts: { filename: string; functionId: string }) => string
  },
) {
  const ast = parseAst(opts)
  const serverFnPathsByFunctionId: Record<
    string,
    {
      nodePath: babel.NodePath
      functionName: string
      functionId: string
    }
  > = {}
  const counts: Record<string, number> = {}

  babel.traverse(ast, {
    Program: {
      enter(programPath) {
        const recordServerFunction = (nodePath: babel.NodePath) => {
          const fnName = findNearestVariableName(nodePath)

          const baseLabel = makeFileLocationUrlSafe(
            `${opts.filename.replace(
              path.extname(opts.filename),
              '',
            )}--${fnName}`.replace(opts.root, ''),
          )

          counts[baseLabel] = (counts[baseLabel] || 0) + 1

          const functionId =
            counts[baseLabel] > 1
              ? `${baseLabel}_${counts[baseLabel] - 1}`
              : baseLabel

          serverFnPathsByFunctionId[functionId] = {
            nodePath,
            functionName: fnName || '',
            functionId: functionId,
          }
        }

        programPath.traverse({
          enter(path) {
            // Function declarations
            if (path.isFunctionDeclaration()) {
              const directives = path.node.body.directives
              for (const directive of directives) {
                if (directive.value.value === 'use server') {
                  recordServerFunction(path)
                }
              }
            }

            // Function expressions
            if (path.isFunctionExpression()) {
              const directives = path.node.body.directives
              for (const directive of directives) {
                if (directive.value.value === 'use server') {
                  recordServerFunction(path)
                }
              }
            }

            // Arrow functions
            if (path.isArrowFunctionExpression()) {
              if (babel.types.isBlockStatement(path.node.body)) {
                const directives = path.node.body.directives
                for (const directive of directives) {
                  if (directive.value.value === 'use server') {
                    recordServerFunction(path)
                  }
                }
              }
            }

            // Class methods
            if (path.isClassMethod()) {
              const directives = path.node.body.directives
              for (const directive of directives) {
                if (directive.value.value === 'use server') {
                  recordServerFunction(path)
                }
              }
            }

            // Object methods
            if (path.isObjectMethod()) {
              const directives = path.node.body.directives
              for (const directive of directives) {
                if (directive.value.value === 'use server') {
                  recordServerFunction(path)
                }
              }
            }

            // Variable declarations with function expressions
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
                    recordServerFunction(path.get('init') as babel.NodePath)
                  }
                }
              }
            }
          },
        })

        if (Object.keys(serverFnPathsByFunctionId).length > 0) {
          const runtimeImport = babel.template.statement(
            opts.getRuntimeCode({ serverFnPathsByFunctionId }),
          )()
          ast.program.body.unshift(runtimeImport)
        }

        // Replace server functions with client-side stubs
        for (const [functionId, fnPath] of Object.entries(
          serverFnPathsByFunctionId,
        )) {
          const replacementCode = opts.replacer({
            filename: opts.filename,
            functionId: functionId,
          })
          const replacement = babel.template.expression(replacementCode)()

          // For variable declarations, replace the init
          if (fnPath.nodePath.isVariableDeclarator()) {
            fnPath.nodePath.get('init').replaceWith(replacement)
          }
          // For class/object methods, replace the whole method
          else if (
            fnPath.nodePath.isClassMethod() ||
            fnPath.nodePath.isObjectMethod()
          ) {
            fnPath.nodePath.replaceWith(
              babel.types.classMethod(
                fnPath.nodePath.node.kind,
                fnPath.nodePath.node.key,
                fnPath.nodePath.node.params,
                babel.types.blockStatement([
                  babel.types.returnStatement(replacement),
                ]),
              ),
            )
          }
          // For function expressions, replace the whole path
          else {
            fnPath.nodePath.replaceWith(replacement)
          }
        }
      },
    },
  })

  const compiledCode = generate(ast, {
    sourceMaps: true,
    minified: process.env.NODE_ENV === 'production',
  })

  return {
    compiledCode,
    serverFns: serverFnPathsByFunctionId,
  }
}

export function compileServerFnServer(opts: ParseAstOptions) {
  const ast = parseAst(opts)

  const compiledCode = generate(ast, {
    sourceMaps: true,
    minified: process.env.NODE_ENV === 'production',
  })

  return {
    compiledCode,
  }
}

// function codeFrameError(
//   code: string,
//   loc: {
//     start: { line: number; column: number }
//     end: { line: number; column: number }
//   },
//   message: string,
// ) {
//   const frame = codeFrameColumns(
//     code,
//     {
//       start: loc.start,
//       end: loc.end,
//     },
//     {
//       highlightCode: true,
//       message,
//     },
//   )

//   return new Error(frame)
// }
