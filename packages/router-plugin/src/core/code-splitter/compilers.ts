import * as t from '@babel/types'
import babel from '@babel/core'
import _generate from '@babel/generator'
import * as template from '@babel/template'
import { deadCodeElimination } from 'babel-dead-code-elimination'

import { splitPrefix } from '../constants'
import { parseAst } from './ast'
import type { ParseAstOptions } from './ast'

// Babel is a CJS package and uses `default` as named binding (`exports.default =`).
// https://github.com/babel/babel/issues/15269.
let generate = (_generate as any)['default'] as typeof _generate

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (!generate) {
  generate = _generate
}

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

export function compileCodeSplitReferenceRoute(opts: ParseAstOptions) {
  const ast = parseAst(opts)

  if (!ast) {
    throw new Error(
      `Failed to compile ast for compileCodeSplitReferenceRoute() for the file: ${opts.filename}`,
    )
  }

  babel.traverse(ast, {
    Program: {
      enter(programPath, programState) {
        const state = programState as unknown as State

        const splitUrl = `${splitPrefix}:${opts.filename}?${splitPrefix}`

        /**
         * If the component for the route is being imported from
         * another file, this is to track the path to that file
         * the path itself doesn't matter, we just need to keep
         * track of it so that we can remove it from the imports
         * list if it's not being used like:
         *
         * `import '../shared/imported'`
         */
        let existingCompImportPath: string | null = null
        let existingLoaderImportPath: string | null = null

        programPath.traverse(
          {
            CallExpression: (path) => {
              if (!t.isIdentifier(path.node.callee)) {
                return
              }

              if (
                !(
                  path.node.callee.name === 'createRoute' ||
                  path.node.callee.name === 'createFileRoute'
                )
              ) {
                return
              }

              if (t.isCallExpression(path.parentPath.node)) {
                const options = resolveIdentifier(
                  path,
                  path.parentPath.node.arguments[0],
                )

                let found = false

                const hasImportedOrDefinedIdentifier = (name: string) => {
                  return programPath.scope.hasBinding(name)
                }

                if (t.isObjectExpression(options)) {
                  options.properties.forEach((prop) => {
                    if (t.isObjectProperty(prop)) {
                      if (t.isIdentifier(prop.key)) {
                        if (prop.key.name === 'component') {
                          const value = prop.value

                          let shouldSplit = true

                          if (t.isIdentifier(value)) {
                            existingCompImportPath =
                              getImportSpecifierAndPathFromLocalName(
                                programPath,
                                value.name,
                              ).path

                            // exported identifiers should not be split
                            // since they are already being imported
                            // and need to be retained in the compiled file
                            const isExported = hasExport(ast, value)
                            shouldSplit = !isExported

                            if (shouldSplit) {
                              removeIdentifierLiteral(path, value)
                            }
                          }

                          if (shouldSplit) {
                            // Prepend the import statement to the program along with the importer function
                            // Check to see if lazyRouteComponent is already imported before attempting
                            // to import it again

                            if (
                              !hasImportedOrDefinedIdentifier(
                                'lazyRouteComponent',
                              )
                            ) {
                              programPath.unshiftContainer('body', [
                                template.statement(
                                  `import { lazyRouteComponent } from '@tanstack/react-router'`,
                                )(),
                              ])
                            }

                            if (
                              !hasImportedOrDefinedIdentifier(
                                '$$splitComponentImporter',
                              )
                            ) {
                              programPath.unshiftContainer('body', [
                                template.statement(
                                  `const $$splitComponentImporter = () => import('${splitUrl}')`,
                                )(),
                              ])
                            }

                            prop.value = template.expression(
                              `lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr)`,
                            )()

                            programPath.pushContainer('body', [
                              template.statement(
                                `function DummyComponent() { return null }`,
                              )(),
                            ])

                            found = true
                          }
                        } else if (prop.key.name === 'loader') {
                          const value = prop.value

                          let shouldSplit = true

                          if (t.isIdentifier(value)) {
                            existingLoaderImportPath =
                              getImportSpecifierAndPathFromLocalName(
                                programPath,
                                value.name,
                              ).path

                            // exported identifiers should not be split
                            // since they are already being imported
                            // and need to be retained in the compiled file
                            const isExported = hasExport(ast, value)
                            shouldSplit = !isExported

                            if (shouldSplit) {
                              removeIdentifierLiteral(path, value)
                            }
                          }

                          if (shouldSplit) {
                            // Prepend the import statement to the program along with the importer function
                            if (!hasImportedOrDefinedIdentifier('lazyFn')) {
                              programPath.unshiftContainer('body', [
                                template.smart(
                                  `import { lazyFn } from '@tanstack/react-router'`,
                                )() as t.Statement,
                              ])
                            }

                            if (
                              !hasImportedOrDefinedIdentifier(
                                '$$splitLoaderImporter',
                              )
                            ) {
                              programPath.unshiftContainer('body', [
                                template.statement(
                                  `const $$splitLoaderImporter = () => import('${splitUrl}')`,
                                )(),
                              ])
                            }

                            prop.value = template.expression(
                              `lazyFn($$splitLoaderImporter, 'loader')`,
                            )()

                            found = true
                          }
                        }
                      }
                    }

                    programPath.scope.crawl()
                  })
                }

                if (found as boolean) {
                  programPath.pushContainer('body', [
                    template.statement(`function TSR_Dummy_Component() {}`)(),
                  ])
                }
              }
            },
          },
          state,
        )

        /**
         * If the component for the route is being imported,
         * and it's not being used, remove the import statement
         * from the program, by checking that the import has no
         * specifiers
         */
        if (
          (existingCompImportPath as string | null) ||
          (existingLoaderImportPath as string | null)
        ) {
          programPath.traverse({
            ImportDeclaration(path) {
              if (path.node.specifiers.length > 0) return
              if (
                path.node.source.value === existingCompImportPath ||
                path.node.source.value === existingLoaderImportPath
              ) {
                path.remove()
              }
            },
          })
        }
      },
    },
  })

  deadCodeElimination(ast)

  return generate(ast, {
    sourceMaps: true,
  })
}

const splitNodeTypes = ['component', 'loader'] as const
type SplitNodeType = (typeof splitNodeTypes)[number]

export function compileCodeSplitVirtualRoute(opts: ParseAstOptions) {
  const ast = parseAst(opts)

  if (!ast) {
    throw new Error(
      `Failed to compile ast for compileCodeSplitVirtualRoute() for the file: ${opts.filename}`,
    )
  }

  const knownExportedIdents = new Set<string>()

  babel.traverse(ast, {
    Program: {
      enter(programPath, programState) {
        const state = programState as unknown as State

        const splitNodesByType: Record<SplitNodeType, t.Node | undefined> = {
          component: undefined,
          loader: undefined,
        }

        // Find the node
        programPath.traverse(
          {
            CallExpression: (path) => {
              if (!t.isIdentifier(path.node.callee)) {
                return
              }

              if (
                !(
                  path.node.callee.name === 'createRoute' ||
                  path.node.callee.name === 'createFileRoute'
                )
              ) {
                return
              }

              if (t.isCallExpression(path.parentPath.node)) {
                const options = resolveIdentifier(
                  path,
                  path.parentPath.node.arguments[0],
                )

                if (t.isObjectExpression(options)) {
                  options.properties.forEach((prop) => {
                    if (t.isObjectProperty(prop)) {
                      splitNodeTypes.forEach((splitType) => {
                        if (
                          !t.isIdentifier(prop.key) ||
                          prop.key.name !== splitType
                        ) {
                          return
                        }

                        const value = prop.value

                        let isExported = false
                        if (t.isIdentifier(value)) {
                          isExported = hasExport(ast, value)
                          if (isExported) {
                            knownExportedIdents.add(value.name)
                          }
                        }

                        // If the node is exported, we need to remove
                        // the export from the split file
                        if (isExported && t.isIdentifier(value)) {
                          removeExports(ast, value)
                        } else {
                          splitNodesByType[splitType] = prop.value
                        }
                      })
                    }
                  })

                  // Remove all of the options
                  options.properties = []
                }
              }
            },
          },
          state,
        )

        splitNodeTypes.forEach((splitType) => {
          let splitNode = splitNodesByType[splitType]

          if (!splitNode) {
            return
          }

          while (t.isIdentifier(splitNode)) {
            const binding = programPath.scope.getBinding(splitNode.name)
            splitNode = binding?.path.node
          }

          // Add the node to the program
          if (splitNode) {
            if (t.isFunctionDeclaration(splitNode)) {
              programPath.pushContainer(
                'body',
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier(splitType),
                    t.functionExpression(
                      splitNode.id || null, // Anonymize the function expression
                      splitNode.params,
                      splitNode.body,
                      splitNode.generator,
                      splitNode.async,
                    ),
                  ),
                ]),
              )
            } else if (
              t.isFunctionExpression(splitNode) ||
              t.isArrowFunctionExpression(splitNode)
            ) {
              programPath.pushContainer(
                'body',
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier(splitType),
                    splitNode as any,
                  ),
                ]),
              )
            } else if (
              t.isImportSpecifier(splitNode) ||
              t.isImportDefaultSpecifier(splitNode)
            ) {
              programPath.pushContainer(
                'body',
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier(splitType),
                    splitNode.local,
                  ),
                ]),
              )
            } else if (t.isCallExpression(splitNode)) {
              const outputSplitNodeCode = generate(splitNode).code
              const splitNodeAst = babel.parse(outputSplitNodeCode)

              if (!splitNodeAst) {
                throw new Error(
                  `Failed to parse the generated code for "${splitType}" in the node type "${splitNode.type}"`,
                )
              }

              const statement = splitNodeAst.program.body[0]

              if (!statement) {
                throw new Error(
                  `Failed to parse the generated code for "${splitType}" in the node type "${splitNode.type}" as no statement was found in the program body`,
                )
              }

              if (t.isExpressionStatement(statement)) {
                const expression = statement.expression
                programPath.pushContainer(
                  'body',
                  t.variableDeclaration('const', [
                    t.variableDeclarator(t.identifier(splitType), expression),
                  ]),
                )
              } else {
                throw new Error(
                  `Unexpected expression type encounter for "${splitType}" in the node type "${splitNode.type}"`,
                )
              }
            } else {
              console.info('Unexpected splitNode type:', splitNode)
              throw new Error(`Unexpected splitNode type ☝️: ${splitNode.type}`)
            }
          }

          // If the splitNode exists at the top of the program
          // then we need to remove that copy
          programPath.node.body = programPath.node.body.filter((node) => {
            return node !== splitNode
          })

          // Export the node
          programPath.pushContainer('body', [
            t.exportNamedDeclaration(null, [
              t.exportSpecifier(
                t.identifier(splitType),
                t.identifier(splitType),
              ),
            ]),
          ])
        })

        // convert exports to imports from the original file
        programPath.traverse({
          ExportNamedDeclaration(path) {
            // e.g. export const x = 1 or export { x }
            // becomes
            // import { x } from '${opts.id}'

            if (path.node.declaration) {
              if (t.isVariableDeclaration(path.node.declaration)) {
                path.replaceWith(
                  t.importDeclaration(
                    path.node.declaration.declarations.map((decl) =>
                      t.importSpecifier(
                        t.identifier((decl.id as any).name),
                        t.identifier((decl.id as any).name),
                      ),
                    ),
                    t.stringLiteral(
                      opts.filename.split(`?${splitPrefix}`)[0] as string,
                    ),
                  ),
                )
              }
            }
          },
        })
      },
    },
  })

  deadCodeElimination(ast)

  // if there are exported identifiers, then we need to add a warning
  // to the file to let the user know that the exported identifiers
  // will not in the split file but in the original file, therefore
  // increasing the bundle size
  if (knownExportedIdents.size > 0) {
    const list = Array.from(knownExportedIdents).reduce((str, ident) => {
      str += `\n- ${ident}`
      return str
    }, '')

    const warningMessage = `These exports from "${opts.filename.replace('?' + splitPrefix, '')}" are not being code-split and will increase your bundle size: ${list}\nThese should either have their export statements removed or be imported from another file that is not a route.`
    console.warn(warningMessage)

    // append this warning to the file using a template
    if (process.env.NODE_ENV !== 'production') {
      const warningTemplate = template.statement(
        `console.warn(${JSON.stringify(warningMessage)})`,
      )()
      ast.program.body.unshift(warningTemplate)
    }
  }

  return generate(ast, {
    sourceMaps: true,
  })
}

function getImportSpecifierAndPathFromLocalName(
  programPath: babel.NodePath<t.Program>,
  name: string,
): {
  specifier:
    | t.ImportSpecifier
    | t.ImportDefaultSpecifier
    | t.ImportNamespaceSpecifier
    | null
  path: string | null
} {
  let specifier:
    | t.ImportSpecifier
    | t.ImportDefaultSpecifier
    | t.ImportNamespaceSpecifier
    | null = null
  let path: string | null = null

  programPath.traverse({
    ImportDeclaration(importPath) {
      const found = importPath.node.specifiers.find(
        (targetSpecifier) => targetSpecifier.local.name === name,
      )
      if (found) {
        specifier = found
        path = importPath.node.source.value
      }
    },
  })

  return { specifier, path }
}

// Reusable function to get literal value or resolve variable to literal
function resolveIdentifier(path: any, node: any) {
  if (t.isIdentifier(node)) {
    const binding = path.scope.getBinding(node.name)
    if (
      binding
      // && binding.kind === 'const'
    ) {
      const declarator = binding.path.node
      if (t.isObjectExpression(declarator.init)) {
        return declarator.init
      } else if (t.isFunctionDeclaration(declarator.init)) {
        return declarator.init
      }
    }
    return undefined
  }

  return node
}

function removeIdentifierLiteral(path: any, node: any) {
  if (t.isIdentifier(node)) {
    const binding = path.scope.getBinding(node.name)
    if (binding) {
      binding.path.remove()
    }
  }
}

function hasExport(ast: t.File, node: t.Identifier): boolean {
  let found = false

  babel.traverse(ast, {
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        // declared as `const loaderFn = () => {}`
        if (t.isVariableDeclaration(path.node.declaration)) {
          path.node.declaration.declarations.forEach((decl) => {
            if (t.isVariableDeclarator(decl)) {
              if (t.isIdentifier(decl.id)) {
                if (decl.id.name === node.name) {
                  found = true
                }
              }
            }
          })
        }

        // declared as `function loaderFn() {}`
        if (t.isFunctionDeclaration(path.node.declaration)) {
          if (t.isIdentifier(path.node.declaration.id)) {
            if (path.node.declaration.id.name === node.name) {
              found = true
            }
          }
        }
      }
    },
    ExportDefaultDeclaration(path) {
      if (t.isIdentifier(path.node.declaration)) {
        if (path.node.declaration.name === node.name) {
          found = true
        }
      }
    },
  })

  return found
}

function removeExports(ast: t.File, node: t.Identifier): boolean {
  let removed = false

  babel.traverse(ast, {
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        // declared as `const loaderFn = () => {}`
        if (t.isVariableDeclaration(path.node.declaration)) {
          path.node.declaration.declarations.forEach((decl) => {
            if (t.isVariableDeclarator(decl)) {
              if (t.isIdentifier(decl.id)) {
                if (decl.id.name === node.name) {
                  path.remove()
                  removed = true
                }
              }
            }
          })
        } else if (t.isFunctionDeclaration(path.node.declaration)) {
          if (t.isIdentifier(path.node.declaration.id)) {
            if (path.node.declaration.id.name === node.name) {
              path.remove()
              removed = true
            }
          }
        }
      }
    },
    ExportDefaultDeclaration(path) {
      if (t.isIdentifier(path.node.declaration)) {
        if (path.node.declaration.name === node.name) {
          path.remove()
          removed = true
        }
      }
    },
  })

  return removed
}
