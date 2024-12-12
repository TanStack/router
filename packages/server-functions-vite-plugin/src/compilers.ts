import path from 'node:path'
import * as babel from '@babel/core'
import _generate from '@babel/generator'

import { isIdentifier, isVariableDeclarator } from '@babel/types'
import { parseAst } from './ast'
import type { ParseAstOptions } from './ast'

let generate = _generate

if ('default' in generate) {
  generate = generate.default as typeof generate
}

interface ServerFunctionInfo {
  nodePath: babel.NodePath
  functionName: string
  functionId: string
}

// export function compileEliminateDeadCode(opts: ParseAstOptions) {
//   const ast = parseAst(opts)
//   deadCodeElimination(ast)

//   return generate(ast, {
//     sourceMaps: true,
//     sourceFileName: opts.filename,
//     minified: process.env.NODE_ENV === 'production',
//   })
// }

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

function isFunctionDeclaration(
  node: babel.types.Node,
): node is
  | babel.types.FunctionDeclaration
  | babel.types.FunctionExpression
  | babel.types.ArrowFunctionExpression
  | babel.types.ClassMethod
  | babel.types.ObjectMethod {
  return (
    babel.types.isFunctionDeclaration(node) ||
    babel.types.isFunctionExpression(node) ||
    babel.types.isArrowFunctionExpression(node) ||
    babel.types.isClassMethod(node) ||
    babel.types.isObjectMethod(node)
  )
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
      serverFnPathsByFunctionId: Record<string, ServerFunctionInfo>
    }) => string
    replacer: (opts: { filename: string; functionId: string }) => string
  },
) {
  const ast = parseAst(opts)
  const serverFnPathsByFunctionId = findServerFunctions(ast, opts)

  // Add runtime code if there are server functions
  if (Object.keys(serverFnPathsByFunctionId).length > 0) {
    const runtimeImport = babel.template.statement(
      opts.getRuntimeCode({ serverFnPathsByFunctionId }),
    )()
    ast.program.body.unshift(runtimeImport)
  }

  // Replace server functions with client-side stubs
  for (const [functionId, { nodePath }] of Object.entries(
    serverFnPathsByFunctionId,
  )) {
    const replacementCode = opts.replacer({
      filename: opts.filename,
      functionId: functionId,
    })

    // Check to see if the function is a valid function declaration
    if (!isFunctionDeclaration(nodePath.node)) {
      throw new Error(
        `Server function is not a function declaration: ${nodePath.node}`,
      )
    }

    nodePath.node.params = [
      babel.types.restElement(babel.types.identifier('args')),
    ]

    // Remove 'use server' directive
    // Check if the node body is a block statement
    if (!babel.types.isBlockStatement(nodePath.node.body)) {
      throw new Error(
        `Server function body is not a block statement: ${nodePath.node.body}`,
      )
    }

    const nodeBody = nodePath.node.body
    nodeBody.directives = nodeBody.directives.filter(
      (directive) => directive.value.value !== 'use server',
    )

    const replacement = babel.template.expression(
      `(${replacementCode})(...args)`,
    )()

    if (babel.types.isArrowFunctionExpression(nodePath.node)) {
      if (babel.types.isBlockStatement(nodePath.node.body)) {
        nodePath.node.body.body = [babel.types.returnStatement(replacement)]
      } else {
        nodePath.node.body = babel.types.blockStatement([
          babel.types.returnStatement(replacement),
        ])
      }
    } else if (
      babel.types.isFunctionExpression(nodePath.node) ||
      babel.types.isFunctionDeclaration(nodePath.node) ||
      babel.types.isObjectMethod(nodePath.node) ||
      babel.types.isClassMethod(nodePath.node)
    ) {
      nodePath.node.body.body = [babel.types.returnStatement(replacement)]
    }
  }

  const compiledCode = generate(ast, {
    sourceMaps: true,
    sourceFileName: opts.filename,
    minified: process.env.NODE_ENV === 'production',
  })

  return {
    compiledCode,
    serverFns: serverFnPathsByFunctionId,
  }
}

export function compileServerFnServer(opts: ParseAstOptions) {
  const ast = parseAst(opts)
  const serverFnPathsByFunctionId = findServerFunctions(ast, opts)

  // Replace server function bodies with dynamic imports
  Object.entries(serverFnPathsByFunctionId).forEach(
    ([functionId, { nodePath }]) => {
      // Check if the node is a function declaration
      if (!isFunctionDeclaration(nodePath.node)) {
        throw new Error(
          `Server function is not a function declaration: ${nodePath.node}`,
        )
      }

      nodePath.node.params = [
        babel.types.restElement(babel.types.identifier('args')),
      ]

      // Check if the node body is a block statement
      if (!babel.types.isBlockStatement(nodePath.node.body)) {
        throw new Error(
          `Server function body is not a block statement: ${nodePath.node.body}`,
        )
      }

      const nodeBody = nodePath.node.body
      nodeBody.directives = nodeBody.directives.filter(
        (directive) => directive.value.value !== 'use server',
      )

      // Create the dynamic import expression
      const importExpression = babel.template.expression(`
      import(${JSON.stringify(`${opts.filename}?tsr-serverfn-split=${functionId}`)})
        .then(mod => mod.serverFn(...args))
    `)()

      if (babel.types.isArrowFunctionExpression(nodePath.node)) {
        if (babel.types.isBlockStatement(nodePath.node.body)) {
          nodePath.node.body.body = [
            babel.types.returnStatement(importExpression),
          ]
        } else {
          nodePath.node.body = babel.types.blockStatement([
            babel.types.returnStatement(importExpression),
          ])
        }
      } else if (
        babel.types.isFunctionExpression(nodePath.node) ||
        babel.types.isFunctionDeclaration(nodePath.node) ||
        babel.types.isObjectMethod(nodePath.node) ||
        babel.types.isClassMethod(nodePath.node)
      ) {
        nodePath.node.body.body = [
          babel.types.returnStatement(importExpression),
        ]
      }
    },
  )

  const compiledCode = generate(ast, {
    sourceMaps: true,
    sourceFileName: opts.filename,
    minified: process.env.NODE_ENV === 'production',
  })

  return {
    compiledCode,
    serverFns: serverFnPathsByFunctionId,
  }
}

function findServerFunctions(ast: babel.types.File, opts: ParseAstOptions) {
  const serverFnPathsByFunctionId: Record<string, ServerFunctionInfo> = {}
  const counts: Record<string, number> = {}

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

  babel.traverse(ast, {
    Program: {
      enter(programPath) {
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
      },
    },
  })

  return serverFnPathsByFunctionId
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
