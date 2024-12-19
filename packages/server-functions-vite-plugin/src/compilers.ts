import path from 'node:path'
import * as babel from '@babel/core'
import _generate from '@babel/generator'

import { isIdentifier, isVariableDeclarator } from '@babel/types'
import { codeFrameColumns } from '@babel/code-frame'
import { deadCodeElimination } from 'babel-dead-code-elimination'
import { parseAst } from './ast'
import type { ParseAstOptions } from './ast'

let generate = _generate

if ('default' in generate) {
  generate = generate.default as typeof generate
}

export interface ServerFunctionInfo {
  nodePath: SupportedFunctionPath
  functionName: string
  functionId: string
  referenceName: string
  splitFileId: string
}

export type SupportedFunctionPath =
  | babel.NodePath<babel.types.FunctionDeclaration>
  | babel.NodePath<babel.types.FunctionExpression>
  | babel.NodePath<babel.types.ArrowFunctionExpression>

export type ReplacerFn = (opts: {
  fn: string
  splitImportFn: string
  filename: string
  functionId: string
}) => string

// const debug = process.env.TSR_VITE_DEBUG === 'true'

export type CompileDirectivesOpts = ParseAstOptions & {
  directive: string
  getRuntimeCode?: (opts: {
    serverFnPathsByFunctionId: Record<string, ServerFunctionInfo>
  }) => string
  replacer: ReplacerFn
}

const tsrServerFnSplitParam = 'tsr-serverfn-split'

export function compileDirectives(opts: CompileDirectivesOpts) {
  const [_, searchParamsStr] = opts.filename.split('?')
  const searchParams = new URLSearchParams(searchParamsStr)
  const functionId = searchParams.get(tsrServerFnSplitParam)

  const ast = parseAst(opts)
  const serverFnPathsByFunctionId = findServerFunctions(ast, {
    ...opts,
    splitFunctionId: functionId,
  })

  // Add runtime code if there are server functions
  // Add runtime code if there are server functions
  if (
    Object.keys(serverFnPathsByFunctionId).length > 0 &&
    opts.getRuntimeCode
  ) {
    const runtimeImport = babel.template.statement(
      opts.getRuntimeCode({ serverFnPathsByFunctionId }),
    )()
    ast.program.body.unshift(runtimeImport)
  }

  // If there is a functionId, we need to remove all exports
  // then make sure that our function is exported under the
  // "serverFn" name
  if (functionId) {
    const serverFn = serverFnPathsByFunctionId[functionId]

    if (!serverFn) {
      throw new Error(`Server function ${functionId} not found`)
    }

    console.log('functionId', functionId)
    safeRemoveExports(ast)

    ast.program.body.push(
      babel.types.exportDefaultDeclaration(
        babel.types.identifier(serverFn.referenceName),
      ),
    )

    // If we have a functionId, we're also going to DCE the file
    // so that the functionId is not exported
    deadCodeElimination(ast)
  }

  const compiledResult = generate(ast, {
    sourceMaps: true,
    sourceFileName: opts.filename,
    minified: process.env.NODE_ENV === 'production',
  })

  return {
    compiledResult,
    serverFns: serverFnPathsByFunctionId,
  }
}

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
        throw new Error(
          'use server in ClassMethod or ObjectMethod not supported',
        )
      }

      return ''
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

function makeIdentifierSafe(identifier: string): string {
  return identifier
    .replace(/[^a-zA-Z0-9_$]/g, '_') // Replace unsafe chars with underscore
    .replace(/^[0-9]/, '_$&') // Prefix leading number with underscore
    .replace(/^\$/, '_$') // Prefix leading $ with underscore
    .replace(/_{2,}/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, '') // Trim leading/trailing underscores
}

export function findServerFunctions(
  ast: babel.types.File,
  opts: ParseAstOptions & {
    replacer?: ReplacerFn
    splitFunctionId?: string | null
  },
) {
  const serverFnPathsByFunctionId: Record<string, ServerFunctionInfo> = {}
  const functionIdCounts: Record<string, number> = {}
  const referenceCounts: Map<string, number> = new Map()

  let programPath: babel.NodePath<babel.types.Program>

  babel.traverse(ast, {
    Program(path) {
      programPath = path
    },
  })

  // Find all server functions
  babel.traverse(ast, {
    DirectiveLiteral(nodePath) {
      if (nodePath.node.value === 'use server') {
        let directiveFn = nodePath.findParent((p) => p.isFunction()) as
          | SupportedFunctionPath
          | undefined

        if (!directiveFn) return

        // Handle class and object methods which are not supported
        const isGenerator =
          directiveFn.isFunction() && directiveFn.node.generator

        const isClassMethod = directiveFn.isClassMethod()
        const isObjectMethod = directiveFn.isObjectMethod()

        if (isClassMethod || isObjectMethod || isGenerator) {
          throw codeFrameError(
            opts.code,
            directiveFn.node.loc,
            `use server in ${isClassMethod ? 'class' : isObjectMethod ? 'object method' : 'generator function'} not supported`,
          )
        }

        // If the function is inside another block that isn't the program,
        // Error out. This is not supported.
        const nearestBlock = directiveFn.findParent(
          (p) => (p.isBlockStatement() || p.isScopable()) && !p.isProgram(),
        )

        if (nearestBlock) {
          throw codeFrameError(
            opts.code,
            nearestBlock.node.loc,
            'Server functions cannot be nested in other blocks or functions',
          )
        }

        // Handle supported function types
        if (
          directiveFn.isFunctionDeclaration() ||
          directiveFn.isFunctionExpression() ||
          (directiveFn.isArrowFunctionExpression() &&
            babel.types.isBlockStatement(directiveFn.node.body))
        ) {
          // Remove the 'use server' directive from the function body
          if (
            babel.types.isFunction(directiveFn.node) &&
            babel.types.isBlockStatement(directiveFn.node.body)
          ) {
            directiveFn.node.body.directives =
              directiveFn.node.body.directives.filter(
                (directive) => directive.value.value !== 'use server',
              )
          }

          // Find the nearest variable name
          const fnName = findNearestVariableName(directiveFn)

          // Make the functionId safe for use in a URL
          const baseLabel = makeFileLocationUrlSafe(
            `${opts.filename.replace(
              path.extname(opts.filename),
              '',
            )}--${fnName}`.replace(opts.root, ''),
          )

          // Count the number of functions with the same baseLabel
          functionIdCounts[baseLabel] = (functionIdCounts[baseLabel] || 0) + 1

          // If there are multiple functions with the same baseLabel,
          // append a unique identifier to the functionId
          const functionId =
            functionIdCounts[baseLabel] > 1
              ? `${baseLabel}_${functionIdCounts[baseLabel] - 1}`
              : baseLabel

          // Move the function to program level while preserving its position
          // in the program body
          const programBody = programPath.node.body

          const topParent =
            directiveFn.findParent((p) => !!p.parentPath?.isProgram()) ||
            directiveFn

          const topParentIndex = programBody.indexOf(topParent.node as any)

          // Determine the reference name for the function
          let referenceName = makeIdentifierSafe(fnName)

          // If we find this referece in the scope, we need to make it unique
          while (programPath.scope.hasBinding(referenceName)) {
            referenceCounts.set(
              referenceName,
              (referenceCounts.get(referenceName) || 0) + 1,
            )
            referenceName += `_${referenceCounts.get(referenceName) || 0}`
          }

          // if (referenceCounts.get(referenceName) === 0) {

          // referenceName += `_${(referenceCounts.get(referenceName) || 0) + 1}`

          // If the reference name came from the function declaration,
          // // We need to update the function name to match the reference name
          // if (babel.types.isFunctionDeclaration(directiveFn.node)) {
          //   console.log('updating function name', directiveFn.node.id!.name)
          //   directiveFn.node.id!.name = referenceName
          // }

          // If the function has a parent that isn't the program,
          // we need to replace it with an identifier and
          // hoist the function to the top level as a const declaration
          if (!directiveFn.parentPath.isProgram()) {
            // Then place the function at the top level
            programBody.splice(
              topParentIndex,
              0,
              babel.types.variableDeclaration('const', [
                babel.types.variableDeclarator(
                  babel.types.identifier(referenceName),
                  babel.types.toExpression(directiveFn.node as any),
                ),
              ]),
            )

            // If it's an exported named function, we need to swap it with an
            // export const originalFunctionName = referenceName
            if (
              babel.types.isExportNamedDeclaration(
                directiveFn.parentPath.node,
              ) &&
              (babel.types.isFunctionDeclaration(directiveFn.node) ||
                babel.types.isFunctionExpression(directiveFn.node)) &&
              babel.types.isIdentifier(directiveFn.node.id)
            ) {
              const originalFunctionName = directiveFn.node.id.name
              programBody.splice(
                topParentIndex + 1,
                0,
                babel.types.exportNamedDeclaration(
                  babel.types.variableDeclaration('const', [
                    babel.types.variableDeclarator(
                      babel.types.identifier(originalFunctionName),
                      babel.types.identifier(referenceName),
                    ),
                  ]),
                ),
              )

              directiveFn.remove()
            } else {
              directiveFn.replaceWith(babel.types.identifier(referenceName))
            }

            directiveFn = programPath.get(
              `body.${topParentIndex}.declarations.0.init`,
            ) as SupportedFunctionPath
          }

          const [filename, searchParamsStr] = opts.filename.split('?')

          const searchParams = new URLSearchParams(searchParamsStr)
          searchParams.set('tsr-serverfn-split', functionId)
          const splitFileId = `${filename}?${searchParams.toString()}`

          // If a replacer is provided, replace the function with the replacer
          if (functionId !== opts.splitFunctionId && opts.replacer) {
            const replacer = opts.replacer({
              fn: '$$fn$$',
              splitImportFn: '$$splitImportFn$$',
              // splitFileId,
              filename: filename!,
              functionId: functionId,
            })

            const replacement = babel.template.expression(replacer, {
              placeholderPattern: false,
              placeholderWhitelist: new Set(['$$fn$$', '$$splitImportFn$$']),
            })({
              ...(replacer.includes('$$fn$$')
                ? { $$fn$$: babel.types.toExpression(directiveFn.node) }
                : {}),
              ...(replacer.includes('$$splitImportFn$$')
                ? {
                    $$splitImportFn$$: `(...args) => import(${JSON.stringify(splitFileId)}).then(module => module.default(...args))`,
                  }
                : {}),
            })

            directiveFn.replaceWith(replacement)
          }

          // Finally register the server function to
          // our map of server functions
          serverFnPathsByFunctionId[functionId] = {
            nodePath: directiveFn,
            referenceName,
            functionName: fnName || '',
            functionId: functionId,
            splitFileId,
          }
        }
      }
    },
  })

  return serverFnPathsByFunctionId
}

function codeFrameError(
  code: string,
  loc:
    | {
        start: { line: number; column: number }
        end: { line: number; column: number }
      }
    | undefined
    | null,
  message: string,
) {
  if (!loc) {
    return new Error(`${message} at unknown location`)
  }

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

const safeRemoveExports = (ast: babel.types.File) => {
  const programBody = ast.program.body

  const removeExport = (
    path:
      | babel.NodePath<babel.types.ExportDefaultDeclaration>
      | babel.NodePath<babel.types.ExportNamedDeclaration>,
  ) => {
    // If the value is a function declaration, class declaration, or variable declaration,
    // That means it has a name and can remain in the file, just unexported.
    if (
      babel.types.isFunctionDeclaration(path.node.declaration) ||
      babel.types.isClassDeclaration(path.node.declaration) ||
      babel.types.isVariableDeclaration(path.node.declaration)
    ) {
      // If the value is a function declaration, class declaration, or variable declaration,
      // That means it has a name and can remain in the file, just unexported.
      if (
        babel.types.isFunctionDeclaration(path.node.declaration) ||
        babel.types.isClassDeclaration(path.node.declaration) ||
        babel.types.isVariableDeclaration(path.node.declaration)
      ) {
        // Move the declaration to the top level at the same index
        const insertIndex = programBody.findIndex(
          (node) => node === path.node.declaration,
        )
        programBody.splice(insertIndex, 0, path.node.declaration as any)
      }
    }

    // Otherwise, remove the export declaration
    path.remove()
  }

  // Before we add our export, remove any other exports.
  // Don't remove the thing they export, just the export declaration
  babel.traverse(ast, {
    ExportDefaultDeclaration(path) {
      removeExport(path)
    },
    ExportNamedDeclaration(path) {
      removeExport(path)
    },
  })
}
