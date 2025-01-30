import * as t from '@babel/types'
import babel from '@babel/core'
import * as template from '@babel/template'
import { deadCodeElimination } from 'babel-dead-code-elimination'
import { generateFromAst, parseAst } from '@tanstack/router-utils'
import { splitPrefix } from '../constants'
import type { GeneratorResult, ParseAstOptions } from '@tanstack/router-utils'

const debug = process.env.TSR_VITE_DEBUG

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

function addSplitSearchParamToFilename(filename: string) {
  const [bareFilename] = filename.split('?')
  return `${bareFilename}?${splitPrefix}`
}

function removeSplitSearchParamFromFilename(filename: string) {
  const [bareFilename] = filename.split('?')
  return bareFilename!
}

type SplitRouteIdentNodes = 'component' | 'loader'
type SplitNodeMeta = {
  routeIdent: SplitRouteIdentNodes
  splitStrategy: 'normal' | 'react-component'
  localImporterIdent: string
  exporterIdent: string
  localExporterIdent: string
}
const SPLIT_NOES_CONFIG = new Map<SplitRouteIdentNodes, SplitNodeMeta>([
  [
    'component',
    {
      routeIdent: 'component',
      localImporterIdent: '$$splitComponentImporter', // const $$splitComponentImporter = () => import('...')
      splitStrategy: 'react-component',
      localExporterIdent: 'SplitComponent', // const SplitComponent = ...
      exporterIdent: 'component', // export { SplitComponent as component }
    },
  ],
  [
    'loader',
    {
      routeIdent: 'loader',
      localImporterIdent: '$$splitLoaderImporter', // const $$splitLoaderImporter = () => import('...')
      splitStrategy: 'normal',
      localExporterIdent: 'SplitLoader', // const SplitLoader = ...
      exporterIdent: 'loader', // export { SplitLoader as loader }
    },
  ],
])
const SPLIT_ROUTE_IDENT_NODES = [...SPLIT_NOES_CONFIG.keys()] as const

export function compileCodeSplitReferenceRoute(
  opts: ParseAstOptions,
): GeneratorResult {
  const ast = parseAst(opts)

  babel.traverse(ast, {
    Program: {
      enter(programPath, programState) {
        const state = programState as unknown as State

        // We need to extract the existing search params from the filename, if any
        // and add the splitPrefix to them, then write them back to the filename
        const splitUrl = addSplitSearchParamToFilename(opts.filename)

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

                const hasImportedOrDefinedIdentifier = (name: string) => {
                  return programPath.scope.hasBinding(name)
                }

                if (t.isObjectExpression(options)) {
                  options.properties.forEach((prop) => {
                    if (t.isObjectProperty(prop)) {
                      if (t.isIdentifier(prop.key)) {
                        const key = prop.key.name
                        // find key in nodeSplitConfig
                        const isNodeConfigAvailable = SPLIT_NOES_CONFIG.has(
                          key as any,
                        )

                        if (!isNodeConfigAvailable) {
                          return
                        }

                        const splitNodeMeta = SPLIT_NOES_CONFIG.get(key as any)!

                        if (splitNodeMeta.splitStrategy === 'react-component') {
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

                          if (!shouldSplit) {
                            return
                          }

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

                          // Check to see if the importer function is already defined
                          // If not, define it with the dynamic import statement
                          if (
                            !hasImportedOrDefinedIdentifier(
                              splitNodeMeta.localImporterIdent,
                            )
                          ) {
                            programPath.unshiftContainer('body', [
                              template.statement(
                                `const ${splitNodeMeta.localImporterIdent} = () => import('${splitUrl}')`,
                              )(),
                            ])
                          }

                          // If it's a component, we need to pass the function to check the Route.ssr value
                          if (key === 'component') {
                            prop.value = template.expression(
                              `lazyRouteComponent(${splitNodeMeta.localImporterIdent}, '${splitNodeMeta.exporterIdent}', () => Route.ssr)`,
                            )()
                          } else {
                            prop.value = template.expression(
                              `lazyRouteComponent(${splitNodeMeta.localImporterIdent}, '${splitNodeMeta.exporterIdent}')`,
                            )()
                          }

                          // If the TSRDummyComponent is not defined, define it
                          if (
                            !hasImportedOrDefinedIdentifier('TSRDummyComponent')
                          ) {
                            programPath.pushContainer('body', [
                              template.statement(
                                `export function TSRDummyComponent() { return null }`,
                              )(),
                            ])
                          }
                        }

                        if (splitNodeMeta.splitStrategy === 'normal') {
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

                          if (!shouldSplit) {
                            return
                          }

                          // Prepend the import statement to the program along with the importer function
                          if (!hasImportedOrDefinedIdentifier('lazyFn')) {
                            programPath.unshiftContainer(
                              'body',
                              template.smart(
                                `import { lazyFn } from '@tanstack/react-router'`,
                              )(),
                            )
                          }

                          // Check to see if the importer function is already defined
                          // If not, define it with the dynamic import statement
                          if (
                            !hasImportedOrDefinedIdentifier(
                              splitNodeMeta.localImporterIdent,
                            )
                          ) {
                            programPath.unshiftContainer('body', [
                              template.statement(
                                `const ${splitNodeMeta.localImporterIdent} = () => import('${splitUrl}')`,
                              )(),
                            ])
                          }

                          // Add the lazyFn call with the dynamic import to the prop value
                          prop.value = template.expression(
                            `lazyFn(${splitNodeMeta.localImporterIdent}, '${splitNodeMeta.exporterIdent}')`,
                          )()
                        }
                      }
                    }

                    programPath.scope.crawl()
                  })
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

  return generateFromAst(ast, {
    sourceMaps: true,
    sourceFileName: opts.filename,
  })
}

export function compileCodeSplitVirtualRoute(
  opts: ParseAstOptions,
): GeneratorResult {
  const ast = parseAst(opts)

  const knownExportedIdents = new Set<string>()

  babel.traverse(ast, {
    Program: {
      enter(programPath, programState) {
        const state = programState as unknown as State

        const trackedNodesToSplitByType: Record<
          SplitRouteIdentNodes,
          { node: t.Node | undefined; meta: SplitNodeMeta } | undefined
        > = {
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
                      SPLIT_ROUTE_IDENT_NODES.forEach((splitType) => {
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
                          const meta = SPLIT_NOES_CONFIG.get(splitType)!
                          trackedNodesToSplitByType[splitType] = {
                            node: prop.value,
                            meta,
                          }
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

        SPLIT_ROUTE_IDENT_NODES.forEach((SPLIT_TYPE) => {
          const splitKey = trackedNodesToSplitByType[SPLIT_TYPE]

          if (!splitKey) {
            return
          }

          let splitNode = splitKey.node
          const splitMeta = splitKey.meta

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
                    t.identifier(splitMeta.localExporterIdent),
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
                    t.identifier(splitMeta.localExporterIdent),
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
                    t.identifier(splitMeta.localExporterIdent),
                    splitNode.local,
                  ),
                ]),
              )
            } else if (t.isVariableDeclarator(splitNode)) {
              programPath.pushContainer(
                'body',
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier(splitMeta.localExporterIdent),
                    splitNode.init,
                  ),
                ]),
              )
            } else if (t.isCallExpression(splitNode)) {
              const outputSplitNodeCode = generateFromAst(splitNode).code
              const splitNodeAst = babel.parse(outputSplitNodeCode)

              if (!splitNodeAst) {
                throw new Error(
                  `Failed to parse the generated code for "${SPLIT_TYPE}" in the node type "${splitNode.type}"`,
                )
              }

              const statement = splitNodeAst.program.body[0]

              if (!statement) {
                throw new Error(
                  `Failed to parse the generated code for "${SPLIT_TYPE}" in the node type "${splitNode.type}" as no statement was found in the program body`,
                )
              }

              if (t.isExpressionStatement(statement)) {
                const expression = statement.expression
                programPath.pushContainer(
                  'body',
                  t.variableDeclaration('const', [
                    t.variableDeclarator(
                      t.identifier(splitMeta.localExporterIdent),
                      expression,
                    ),
                  ]),
                )
              } else {
                throw new Error(
                  `Unexpected expression type encounter for "${SPLIT_TYPE}" in the node type "${splitNode.type}"`,
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
                t.identifier(splitMeta.localExporterIdent), // local variable name
                t.identifier(splitMeta.exporterIdent), // as what name it should be exported as
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
                      removeSplitSearchParamFromFilename(opts.filename),
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

  return generateFromAst(ast, {
    sourceMaps: true,
    sourceFileName: opts.filename,
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
