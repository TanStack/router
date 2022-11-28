import * as babel from '@babel/core'
import * as t from '@babel/types'
// @ts-ignore
import syntaxTS from '@babel/plugin-syntax-typescript'
import { IsolatedExport, removeExt, RouteNode } from './generator'
import path from 'path'
import { Config } from './config'

export const isolatedProperties = [
  'loader',
  'action',
  'component',
  'errorComponent',
  'pendingComponent',
] as const

export type IsolatedProperty = typeof isolatedProperties[number]

type Opts = {
  ssr: boolean
  isolate: IsolatedProperty
}

const getBasePlugins = () => [
  [
    syntaxTS,
    {
      isTSX: true,
      // disallowAmbiguousJSXLike: true,
    },
  ],
]

export async function ensureBoilerplate(node: RouteNode, code: string) {
  const relativeImportPath = path.relative(node.fullDir, node.genPathNoExt)

  const originalFile = await babel.transformAsync(code, {
    configFile: false,
    babelrc: false,
    plugins: [...getBasePlugins()],
  })

  const file = await babel.transformAsync(code, {
    configFile: false,
    babelrc: false,
    plugins: [
      ...getBasePlugins(),
      {
        visitor: {
          Program: {
            enter(programPath, state) {
              // Remove all properties except for our isolated one
              let foundImport = false

              programPath.traverse({
                ImportSpecifier(importPath) {
                  if (
                    t.isIdentifier(importPath.node.imported) &&
                    importPath.node.imported.name === 'routeConfig'
                  ) {
                    foundImport = true
                    if (t.isImportDeclaration(importPath.parentPath.node)) {
                      if (
                        importPath.parentPath.node.source.value !==
                        relativeImportPath
                      ) {
                        importPath.parentPath.node.source.value =
                          relativeImportPath
                      }
                    }
                  }
                },
              })

              if (!foundImport) {
                programPath.node.body.unshift(
                  babel.template.statement(
                    `import { routeConfig } from '${relativeImportPath}'`,
                  )(),
                )
              }
            },
          },
        },
      },
    ],
  })

  if (!originalFile?.code) {
    return `${file?.code}\n\nrouteConfig.generate({\n\n})`
  }

  const separator = 'routeConfig.generate('

  const originalHead = originalFile?.code?.substring(
    0,
    originalFile?.code?.indexOf(separator),
  )

  const generatedHead = file?.code?.substring(0, file?.code?.indexOf(separator))

  if (originalHead !== generatedHead) {
    return `${generatedHead}\n\n${originalFile?.code?.substring(
      originalFile?.code?.indexOf(separator),
    )}`
  }

  return
}

export async function isolateOptionToExport(code: string, opts: Opts) {
  return babel.transformAsync(code, {
    configFile: false,
    babelrc: false,
    plugins: [...getBasePlugins(), plugin()],
    ast: true,
  })

  function plugin(): babel.PluginItem {
    return {
      visitor: {
        Program: {
          enter(programPath, state) {
            // Remove all properties except for our isolated one
            programPath.traverse({
              ExportDefaultDeclaration(exportNamedPath) {
                exportNamedPath.remove()
              },
              ExportNamedDeclaration(exportNamedPath) {
                exportNamedPath.remove()
              },
              Identifier(path) {
                if (path.node.name === 'generate') {
                  const options = getOptions(path)

                  if (options) {
                    const property = options.properties.find((property) => {
                      return (
                        t.isObjectProperty(property) &&
                        t.isIdentifier(property.key) &&
                        property.key.name === opts.isolate
                      )
                    })

                    if (t.isObjectProperty(property)) {
                      const program = path.findParent((d) => d.isProgram())

                      if (program?.isProgram()) {
                        program.node.body.push(
                          babel.template.statement(
                            `export const ${opts.isolate} = $LOADER`,
                          )({
                            $LOADER: property.value,
                          }),
                        )
                      }
                    }

                    path.findParent((d) => d.isExpressionStatement())?.remove()
                  }
                }
              },
            })

            cleanUnusedCode(programPath, state)
          },
        },
      },
    }
  }
}

export async function detectExports(code: string) {
  let exported: string[] = []

  // try {
  await babel.transformAsync(code, {
    configFile: false,
    babelrc: false,
    plugins: [
      ...getBasePlugins(),
      {
        visitor: {
          ExportNamedDeclaration(path) {
            if (t.isVariableDeclaration(path.node.declaration)) {
              if (
                t.isVariableDeclarator(path.node.declaration.declarations?.[0])
              ) {
                if (t.isIdentifier(path.node.declaration.declarations[0].id)) {
                  exported.push(path.node.declaration.declarations[0].id.name)
                }
              }
            }
          },
        },
      },
    ],
    ast: true,
  })

  return exported
}

export async function generateRouteConfig(
  routeCode: string,
  node: RouteNode,
  config: Config,
  imports: IsolatedExport[],
) {
  const relativeParentRoutePath = node.parent
    ? removeExt(path.relative(node.genDir, node.parent?.genPath))
    : path.relative(node.genDir, path.resolve(config.routesDirectory, 'root'))

  const pathName = node.fileNameNoExt.startsWith('__')
    ? undefined
    : node.fileNameNoExt === 'index'
    ? '/'
    : node.fileNameNoExt

  const routeId = node.fileNameNoExt

  function plugin(): babel.PluginItem {
    return {
      visitor: {
        Program: {
          enter(programPath, state) {
            programPath.node.body.unshift(
              babel.template.statement(
                `import { lazy } from '@tanstack/react-router'`,
              )(),
            )

            // Remove all of the isolated import properties from the config
            programPath.traverse({
              ImportSpecifier(path) {
                if (t.isIdentifier(path.node.imported)) {
                  if (path.node.imported.name === 'routeConfig') {
                    path.parentPath.remove()

                    const program = path.findParent((d) => d.isProgram())

                    if (program?.isProgram()) {
                      program.node.body.unshift(
                        babel.template.statement(
                          `import { routeConfig as parentRouteConfig } from '$IMPORT'`,
                        )({
                          $IMPORT: relativeParentRoutePath,
                        }),
                      )
                    }
                  }
                }
              },
              Identifier(iPath) {
                if (iPath.node.name === 'generate') {
                  if (t.isMemberExpression(iPath.parentPath.node)) {
                    if (t.isIdentifier(iPath.parentPath.node.object)) {
                      iPath.node.name = 'createRoute'
                      iPath.parentPath.node.object.name = 'parentRouteConfig'

                      const options = getOptions(iPath)

                      if (options) {
                        options.properties = [
                          pathName
                            ? t.objectProperty(
                                t.identifier('path'),
                                t.stringLiteral(pathName),
                              )
                            : t.objectProperty(
                                t.identifier('id'),
                                t.stringLiteral(routeId),
                              ),
                          ...options.properties.filter((property) => {
                            return t.isObjectProperty(property) &&
                              t.isIdentifier(property.key) &&
                              isolatedProperties.includes(
                                property.key.name as IsolatedProperty,
                              )
                              ? false
                              : true
                          }),
                          ...imports.map(({ key }) => {
                            if (key === 'loader') {
                              return t.objectProperty(
                                t.identifier(key),
                                babel.template.expression(
                                  `(...args) => import('./${path.relative(
                                    node.genDir,
                                    node.genPathNoExt,
                                  )}-${key}').then(d => d.${key}.apply(d.${key}, (args as any)))`,
                                  {
                                    plugins: ['typescript'],
                                  },
                                )({}),
                              )
                            }

                            if (key === 'action') {
                              return t.objectProperty(
                                t.identifier(key),
                                babel.template.expression(
                                  `(...payload: Parameters<typeof import('./${path.relative(
                                    node.genDir,
                                    node.genPathNoExt,
                                  )}-${key}').action>) => import('./${path.relative(
                                    node.genDir,
                                    node.genPathNoExt,
                                  )}-${key}').then(d => d.${key}.apply(d.${key}, (payload as any)))`,
                                  {
                                    plugins: ['typescript'],
                                  },
                                )({}),
                              )
                            }

                            return t.objectProperty(
                              t.identifier(key),
                              babel.template.expression(`
                                lazy(() => import('./${path.relative(
                                  node.genDir,
                                  node.genPathNoExt,
                                )}-${key}').then(d => ({ default: d.${key} }) ))`)(),
                            )
                          }),
                        ]

                        const program = iPath.findParent((d) => d.isProgram())

                        if (program?.isProgram() && options) {
                          const index = program.node.body.findIndex(
                            (d) =>
                              d.start ===
                              iPath.parentPath.parentPath?.node.start,
                          )

                          program.node.body[index] = babel.template.statement(
                            `const routeConfig = parentRouteConfig.createRoute(
                                $OPTIONS
                              )`,
                          )({
                            $OPTIONS: options,
                          })
                        }
                      }
                    }
                  }
                }
              },
            })

            // Add the routeConfig exports
            programPath.node.body.push(
              babel.template.statement(
                `export { routeConfig, routeConfig as ${node.variable}Route }`,
              )(),
            )

            cleanUnusedCode(programPath, state)
          },
        },
      },
    }
  }

  const code = (
    await babel.transformAsync(routeCode, {
      configFile: false,
      babelrc: false,
      plugins: [...getBasePlugins(), plugin()],
      ast: true,
    })
  )?.code

  if (!code) {
    console.log(code, node, imports)
    throw new Error('Error while generating a route file!')
  }

  return code
}

function getIdentifier(path: any) {
  const parentPath = path.parentPath
  if (parentPath.type === 'VariableDeclarator') {
    const pp = parentPath
    const name = pp.get('id')
    return name.node.type === 'Identifier' ? name : null
  }
  if (parentPath.type === 'AssignmentExpression') {
    const pp = parentPath
    const name = pp.get('left')
    return name.node.type === 'Identifier' ? name : null
  }
  if (path.node.type === 'ArrowFunctionExpression') {
    return null
  }
  return path.node.id && path.node.id.type === 'Identifier'
    ? path.get('id')
    : null
}

function isIdentifierReferenced(ident: any) {
  const b = ident.scope.getBinding(ident.node.name)
  if (b && b.referenced) {
    if (b.path.type === 'FunctionDeclaration') {
      return !b.constantViolations
        .concat(b.referencePaths)
        .every((ref: any) => ref.findParent((p: any) => p === b.path))
    }
    return true
  }
  return false
}
function markFunction(path: any, state: any) {
  const ident = getIdentifier(path)
  if (ident && ident.node && isIdentifierReferenced(ident)) {
    state.refs.add(ident)
  }
}
function markImport(path: any, state: any) {
  const local = path.get('local')
  if (isIdentifierReferenced(local)) {
    state.refs.add(local)
  }
}

function getOptions(path: any): t.ObjectExpression | void {
  if (
    t.isMemberExpression(path.parentPath.node) &&
    t.isCallExpression(path.parentPath.parentPath?.node)
  ) {
    const options = path.parentPath.parentPath?.node.arguments[0]

    const tryOptions = (node: any): t.ObjectExpression | void => {
      if (t.isIdentifier(node)) {
        const initNode = path.scope.getBinding(node.name)?.path.node
        if (t.isVariableDeclarator(initNode)) {
          return tryOptions(initNode.init)
        }
      } else if (t.isObjectExpression(node)) {
        return node
      }

      return
    }

    return tryOptions(options)
  }
}

// All credit for this amazing function goes to the Next.js team
// (and the Solid.js team for their derivative work).
// https://github.com/vercel/next.js/blob/canary/packages/next/build/babel/plugins/next-ssg-transform.ts
// https://github.com/solidjs/solid-start/blob/main/packages/start/server/routeData.js

function cleanUnusedCode(
  programPath: babel.NodePath<babel.types.Program>,
  state: any,
) {
  state.refs = new Set()
  state.done = false

  // Mark all variables and functions if used
  programPath.traverse(
    {
      VariableDeclarator(variablePath, variableState: any) {
        if (variablePath.node.id.type === 'Identifier') {
          const local = variablePath.get('id')
          if (isIdentifierReferenced(local)) {
            variableState.refs.add(local)
          }
        } else if (variablePath.node.id.type === 'ObjectPattern') {
          const pattern = variablePath.get('id')
          const properties: any = pattern.get('properties')
          properties.forEach((p: any) => {
            const local = p.get(
              p.node.type === 'ObjectProperty'
                ? 'value'
                : p.node.type === 'RestElement'
                ? 'argument'
                : (function () {
                    throw new Error('invariant')
                  })(),
            )
            if (isIdentifierReferenced(local)) {
              variableState.refs.add(local)
            }
          })
        } else if (variablePath.node.id.type === 'ArrayPattern') {
          const pattern = variablePath.get('id')
          const elements: any = pattern.get('elements')
          elements.forEach((e: any) => {
            let local
            if (e.node && e.node.type === 'Identifier') {
              local = e
            } else if (e.node && e.node.type === 'RestElement') {
              local = e.get('argument')
            } else {
              return
            }
            if (isIdentifierReferenced(local)) {
              variableState.refs.add(local)
            }
          })
        }
      },
      FunctionDeclaration: markFunction,
      FunctionExpression: markFunction,
      ArrowFunctionExpression: markFunction,
      ImportSpecifier: markImport,
      ImportDefaultSpecifier: markImport,
      ImportNamespaceSpecifier: markImport,
      ImportDeclaration: (path) => {
        if (path.node.source.value.endsWith('.css')) {
          path.remove()
        }
      },
    },
    state,
  )

  // Sweet all of the remaining references and remove unused ones
  const refs: any = state.refs
  let count: number
  function sweepFunction(sweepPath: any) {
    const ident = getIdentifier(sweepPath)
    if (
      ident &&
      ident.node &&
      refs.has(ident) &&
      !isIdentifierReferenced(ident)
    ) {
      ++count
      if (
        t.isAssignmentExpression(sweepPath.parentPath) ||
        t.isVariableDeclarator(sweepPath.parentPath)
      ) {
        sweepPath.parentPath.remove()
      } else {
        sweepPath.remove()
      }
    }
  }
  function sweepImport(sweepPath: any) {
    const local = sweepPath.get('local')
    if (refs.has(local) && !isIdentifierReferenced(local)) {
      ++count
      sweepPath.remove()
      if (sweepPath.parent.specifiers.length === 0) {
        sweepPath.parentPath.remove()
      }
    }
  }
  do {
    programPath.scope.crawl()
    count = 0
    programPath.traverse({
      VariableDeclarator(variablePath) {
        if (variablePath.node.id.type === 'Identifier') {
          const local = variablePath.get('id')
          if (refs.has(local) && !isIdentifierReferenced(local)) {
            ++count
            variablePath.remove()
          }
        } else if (variablePath.node.id.type === 'ObjectPattern') {
          const pattern = variablePath.get('id')
          const beforeCount = count
          const properties: any = pattern.get('properties')
          properties.forEach((p: any) => {
            const local = p.get(
              p.node.type === 'ObjectProperty'
                ? 'value'
                : p.node.type === 'RestElement'
                ? 'argument'
                : (function () {
                    throw new Error('invariant')
                  })(),
            )
            if (refs.has(local) && !isIdentifierReferenced(local)) {
              ++count
              p.remove()
            }
          })
          if (
            beforeCount !== count &&
            (pattern.get('properties') as any).length < 1
          ) {
            variablePath.remove()
          }
        } else if (variablePath.node.id.type === 'ArrayPattern') {
          const pattern = variablePath.get('id')
          const beforeCount = count
          const elements: any = pattern.get('elements')
          elements.forEach((e: any) => {
            let local
            if (e.node && e.node.type === 'Identifier') {
              local = e
            } else if (e.node && e.node.type === 'RestElement') {
              local = e.get('argument')
            } else {
              return
            }
            if (refs.has(local) && !isIdentifierReferenced(local)) {
              ++count
              e.remove()
            }
          })
          if (
            beforeCount !== count &&
            (pattern.get('elements') as any).length < 1
          ) {
            variablePath.remove()
          }
        }
      },
      FunctionDeclaration: sweepFunction,
      FunctionExpression: sweepFunction,
      ArrowFunctionExpression: sweepFunction,
      ImportSpecifier: sweepImport,
      ImportDefaultSpecifier: sweepImport,
      ImportNamespaceSpecifier: sweepImport,
    })
  } while (count)

  // Do we need the * import for react?
  let hasReact = false

  // Mark react elements as having react
  programPath.traverse({
    JSXElement(path) {
      hasReact = true
    },
  })

  if (!hasReact) {
    // Mark all variables and functions if used
    programPath.traverse({
      ImportDeclaration(path) {
        if (
          t.isStringLiteral(path.node.source) &&
          path.node.source.value === 'react' &&
          t.isImportNamespaceSpecifier(path.node.specifiers[0])
        ) {
          path.remove()
        }
      },
    })
  }
}
