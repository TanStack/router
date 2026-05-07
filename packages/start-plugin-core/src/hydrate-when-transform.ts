import { relative } from 'node:path'
import crypto from 'node:crypto'
import babel from '@babel/core'
import * as t from '@babel/types'
import {
  buildDeclarationMap,
  buildDependencyGraph,
  collectIdentifiersFromNode,
  collectLocalBindingsFromStatement,
  deadCodeElimination,
  expandTransitively,
  findReferencedIdentifiers,
  generateFromAst,
  parseAst,
  removeModuleLevelBindings,
  retainModuleLevelDeclarations,
  stripUnreferencedTopLevelExpressionStatements,
  unwrapExportedDeclarations,
} from '@tanstack/router-utils'
import { tssHydrate } from './hydration-constants'
import { cleanId, codeFrameError } from './start-compiler/utils'
import type { StartCompilerPlugin } from './types'

type HydrationImport = {
  hydrateLocalName: string
  source: string
  interactionLocalNames: Set<string>
}

const hydrateImportSources = new Set([
  '@tanstack/react-start',
  '@tanstack/solid-start',
])

/**
 * Detection pattern used by the transform code filter to pre-scan files for
 * `<Hydrate>` JSX before any AST parsing happens.
 */
const HYDRATE_DETECTION_PATTERN = /\bHydrate\b/

function createBoundaryId(root: string, sourceId: string) {
  const normalized = relative(root, sourceId).replaceAll('\\', '/')
  const label =
    normalized
      .replace(/\.[cm]?[jt]sx?$/, '')
      .replace(/[^a-zA-Z0-9_$]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Hydrate'

  return (index: number) => {
    const hash = crypto
      .createHash('sha1')
      .update(normalized)
      .update(':')
      .update(String(index))
      .digest('hex')
      .slice(0, 10)

    return `${label}_${hash}`
  }
}

function getJSXElementName(node: t.JSXElement) {
  const name = node.openingElement.name
  return t.isJSXIdentifier(name) ? name.name : undefined
}

function getJSXAttribute(node: t.JSXOpeningElement, name: string) {
  for (const item of node.attributes) {
    if (t.isJSXAttribute(item) && t.isJSXIdentifier(item.name, { name })) {
      return item
    }
  }

  return undefined
}

function getBooleanProp(node: t.JSXOpeningElement, name: string) {
  const attr = getJSXAttribute(node, name)
  if (!attr) return undefined
  if (!attr.value) return true
  if (t.isStringLiteral(attr.value)) return attr.value.value !== 'false'
  if (t.isJSXExpressionContainer(attr.value)) {
    if (t.isBooleanLiteral(attr.value.expression)) {
      return attr.value.expression.value
    }
  }
  return undefined
}

function isInteractionCall(
  node: t.Node | null | undefined,
  interactionLocalNames: Set<string>,
) {
  if (!t.isCallExpression(node)) return false
  return (
    t.isIdentifier(node.callee) && interactionLocalNames.has(node.callee.name)
  )
}

function getWhenExpression(node: t.JSXOpeningElement) {
  const when = getJSXAttribute(node, 'when')
  if (!when?.value || !t.isJSXExpressionContainer(when.value)) return undefined
  return when.value.expression
}

const hydrateBoundaryIndexParam = `${tssHydrate}-index`

function parseHydrateVirtualId(id: string) {
  const queryIndex = id.indexOf('?')
  const sourceId = cleanId(queryIndex === -1 ? id : id.slice(0, queryIndex))
  if (queryIndex === -1) {
    return { sourceId, splitId: null, boundaryIndex: -1 }
  }

  const rawQuery = id.slice(queryIndex + 1)
  const params = new URLSearchParams(rawQuery)
  const splitId = params.get(tssHydrate)
  const rawIndex = params.get(hydrateBoundaryIndexParam)
  const boundaryIndex = rawIndex === null ? -1 : Number(rawIndex)

  return {
    sourceId,
    splitId,
    boundaryIndex: Number.isInteger(boundaryIndex) ? boundaryIndex : -1,
  }
}

function createHydrateImportId(sourceId: string, id: string, index: number) {
  const params = new URLSearchParams()
  params.set(tssHydrate, id)
  params.set(hydrateBoundaryIndexParam, String(index))
  return `${sourceId}?${params.toString()}`
}

function upsertSplitId(node: t.JSXOpeningElement, splitId: string) {
  const existing = getJSXAttribute(node, 'splitId')

  if (existing) {
    existing.value = t.stringLiteral(splitId)
    return
  }

  node.attributes.push(
    t.jsxAttribute(t.jsxIdentifier('splitId'), t.stringLiteral(splitId)),
  )
}

function isObjectPropertyName(
  property: t.ObjectMethod | t.ObjectProperty,
  name: string,
) {
  if (t.isIdentifier(property.key) && !property.computed) {
    return property.key.name === name
  }

  return t.isStringLiteral(property.key) && property.key.value === name
}

function isReferenceInsideNode(
  referencePath: babel.NodePath,
  node: t.Node,
): boolean {
  if (referencePath.node === node) return true
  return Boolean(referencePath.findParent((parent) => parent.node === node))
}

function removeBindingDeclaration(
  binding: NonNullable<ReturnType<babel.NodePath['scope']['getBinding']>>,
) {
  if (binding.path.isVariableDeclarator()) {
    const declarationPath = binding.path.parentPath
    if (
      declarationPath.isVariableDeclaration() &&
      declarationPath.node.declarations.length === 1
    ) {
      declarationPath.remove()
      return
    }

    binding.path.remove()
    return
  }

  if (
    binding.path.isImportSpecifier() ||
    binding.path.isImportDefaultSpecifier() ||
    binding.path.isImportNamespaceSpecifier()
  ) {
    const importPath = binding.path.parentPath
    if (
      importPath.isImportDeclaration() &&
      importPath.node.specifiers.length === 1
    ) {
      importPath.remove()
      return
    }

    binding.path.remove()
    return
  }

  binding.path.remove()
}

function stripBindingsOnlyReferencedBy(
  path: babel.NodePath<t.JSXElement>,
  node: t.Node,
  seen = new Set<string>(),
) {
  for (const name of collectIdentifiersFromNode(node)) {
    if (seen.has(name)) continue
    const binding = path.scope.getBinding(name)
    if (!binding?.constant) continue
    if (binding.referencePaths.length === 0) continue
    if (
      !binding.referencePaths.every((referencePath) =>
        isReferenceInsideNode(referencePath, node),
      )
    ) {
      continue
    }

    seen.add(name)

    const bindingNode = binding.path.node
    if (t.isVariableDeclarator(bindingNode) && bindingNode.init) {
      stripBindingsOnlyReferencedBy(path, bindingNode.init, seen)
    } else if (
      t.isFunctionDeclaration(bindingNode) ||
      t.isClassDeclaration(bindingNode)
    ) {
      stripBindingsOnlyReferencedBy(path, bindingNode, seen)
    }

    removeBindingDeclaration(binding)
  }
}

function stripObjectExpressionProperty(
  path: babel.NodePath<t.JSXElement>,
  node: t.ObjectExpression,
  name: string,
) {
  let modified = false

  node.properties = node.properties.filter((property) => {
    if (
      (t.isObjectMethod(property) || t.isObjectProperty(property)) &&
      isObjectPropertyName(property, name)
    ) {
      stripBindingsOnlyReferencedBy(
        path,
        t.isObjectProperty(property) ? property.value : property.body,
      )
      modified = true
      return false
    }

    return true
  })

  return modified
}

function stripSingleUseObjectBindingProperty(
  path: babel.NodePath<t.JSXElement>,
  identifier: t.Identifier,
  name: string,
) {
  const binding = path.scope.getBinding(identifier.name)
  if (!binding?.constant) return false
  if (binding.referencePaths.length !== 1) return false
  if (binding.referencePaths[0]?.node !== identifier) return false
  if (!binding.path.isVariableDeclarator()) return false
  if (!t.isObjectExpression(binding.path.node.init)) return false

  return stripObjectExpressionProperty(path, binding.path.node.init, name)
}

function stripJSXAttribute(path: babel.NodePath<t.JSXElement>, name: string) {
  const node = path.node.openingElement
  let modified = false

  node.attributes = node.attributes.filter((item) => {
    if (t.isJSXAttribute(item) && t.isJSXIdentifier(item.name, { name })) {
      if (item.value) {
        stripBindingsOnlyReferencedBy(path, item.value)
      }
      modified = true
      return false
    }

    if (t.isJSXSpreadAttribute(item) && t.isObjectExpression(item.argument)) {
      if (stripObjectExpressionProperty(path, item.argument, name)) {
        modified = true
      }
      return item.argument.properties.length > 0
    }

    if (t.isJSXSpreadAttribute(item) && t.isIdentifier(item.argument)) {
      if (stripSingleUseObjectBindingProperty(path, item.argument, name)) {
        modified = true
      }
    }

    return true
  })

  return modified
}

function throwBoundaryError(
  code: string,
  path: babel.NodePath<t.JSXElement>,
  message: string,
): never {
  if (path.node.loc) {
    throw codeFrameError(code, path.node.loc, message)
  }
  throw new Error(message)
}

function inspectSplitBoundary(options: {
  code: string
  path: babel.NodePath<t.JSXElement>
  validate?: boolean
  collectCaptured?: boolean
  nestedHydrate?: {
    localName: string
    interactionLocalNames: Set<string>
  }
}) {
  const { path } = options
  const capturedNames = options.collectCaptured ? new Set<string>() : undefined
  const nestedHydrate = options.nestedHydrate
  let nestedBoundaryCount = 0
  let hasNestedInteraction = false

  if (options.validate) {
    for (const child of path.node.children) {
      if (
        t.isJSXExpressionContainer(child) &&
        (t.isFunctionExpression(child.expression) ||
          t.isArrowFunctionExpression(child.expression))
      ) {
        throwBoundaryError(
          options.code,
          path,
          'Hydrate cannot code-split function-as-children. Use split={false} for this boundary.',
        )
      }
    }
  }

  const validateVisitors = options.validate
    ? {
        CallExpression(callPath: babel.NodePath<t.CallExpression>) {
          if (!t.isIdentifier(callPath.node.callee)) return
          if (!/^use[A-Z0-9]/.test(callPath.node.callee.name)) return

          throwBoundaryError(
            options.code,
            path,
            'Hydrate cannot code-split JSX that calls hooks during render. Move the hook call into a child component or use split={false}.',
          )
        },
        ThisExpression(thisPath: babel.NodePath<t.ThisExpression>) {
          void thisPath
          throwBoundaryError(
            options.code,
            path,
            'Hydrate cannot code-split JSX that captures this.',
          )
        },
        Super(superPath: babel.NodePath<t.Super>) {
          void superPath
          throwBoundaryError(
            options.code,
            path,
            'Hydrate cannot code-split JSX that captures super.',
          )
        },
      }
    : {}

  const nestedHydrateVisitors = nestedHydrate
    ? {
        JSXElement(nestedPath: babel.NodePath<t.JSXElement>) {
          if (getJSXElementName(nestedPath.node) !== nestedHydrate.localName) {
            return
          }

          const split = getBooleanProp(nestedPath.node.openingElement, 'split')
          if (split === false) return

          nestedBoundaryCount++
          if (
            isInteractionCall(
              getWhenExpression(nestedPath.node.openingElement),
              nestedHydrate.interactionLocalNames,
            )
          ) {
            hasNestedInteraction = true
          }
        },
      }
    : {}

  const captureVisitors = capturedNames
    ? {
        Identifier(identifierPath: babel.NodePath<t.Identifier>) {
          if (
            identifierPath.findParent(
              (parent) => parent.node === path.node.openingElement,
            )
          ) {
            return
          }

          const parent = identifierPath.parent
          if (
            t.isJSXOpeningElement(parent) ||
            t.isJSXClosingElement(parent) ||
            (t.isObjectProperty(parent, { key: identifierPath.node }) &&
              !parent.computed &&
              !parent.shorthand) ||
            (t.isMemberExpression(parent, {
              property: identifierPath.node,
            }) &&
              !parent.computed)
          ) {
            return
          }

          const binding = identifierPath.scope.getBinding(
            identifierPath.node.name,
          )
          if (!binding) return
          if (t.isProgram(binding.scope.block)) return
          if (
            path.node === binding.scope.block ||
            path.isAncestor(binding.path)
          )
            return

          capturedNames.add(identifierPath.node.name)
        },
        JSXIdentifier(identifierPath: babel.NodePath<t.JSXIdentifier>) {
          if (
            identifierPath.findParent(
              (parent) => parent.node === path.node.openingElement,
            )
          ) {
            return
          }

          if (identifierPath.parentKey !== 'name') return
          const name = identifierPath.node.name
          if (!/^[A-Z]/.test(name)) return
          const binding = identifierPath.scope.getBinding(name)
          if (!binding) return
          if (t.isProgram(binding.scope.block)) return

          capturedNames.add(name)
        },
      }
    : {}

  path.traverse({
    ...validateVisitors,
    ...nestedHydrateVisitors,
    ...captureVisitors,
  })

  return {
    captured: capturedNames ? [...capturedNames].sort() : [],
    nestedBoundaryCount,
    hasNestedInteraction,
  }
}

function getHydrateImport(ast: t.File) {
  let hydrateImport: HydrationImport | undefined

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue
    if (hydrateImportSources.has(node.source.value)) {
      for (const specifier of node.specifiers) {
        if (
          t.isImportSpecifier(specifier) &&
          t.isIdentifier(specifier.imported, { name: 'Hydrate' })
        ) {
          hydrateImport = {
            hydrateLocalName: specifier.local.name,
            source: node.source.value,
            interactionLocalNames:
              hydrateImport?.interactionLocalNames ?? new Set<string>(),
          }
        }
      }
      continue
    }

    if (
      node.source.value !== '@tanstack/react-start/hydration' &&
      node.source.value !== '@tanstack/solid-start/hydration'
    ) {
      continue
    }

    for (const specifier of node.specifiers) {
      if (
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: 'interaction' })
      ) {
        hydrateImport ??= {
          hydrateLocalName: '',
          source: '',
          interactionLocalNames: new Set<string>(),
        }
        hydrateImport.interactionLocalNames.add(specifier.local.name)
      }
    }
  }

  return hydrateImport?.hydrateLocalName ? hydrateImport : undefined
}

function getOrAddInteractionImport(
  programPath: babel.NodePath<t.Program>,
  source: string,
) {
  const importSource = `${source}/hydration`
  for (const node of programPath.node.body) {
    if (!t.isImportDeclaration(node) || node.source.value !== importSource) {
      continue
    }
    for (const specifier of node.specifiers) {
      if (
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: 'interaction' })
      ) {
        return specifier.local
      }
    }
    const interactionIdent =
      programPath.scope.generateUidIdentifier('interaction')
    node.specifiers.push(
      t.importSpecifier(interactionIdent, t.identifier('interaction')),
    )
    return interactionIdent
  }

  const interactionIdent =
    programPath.scope.generateUidIdentifier('interaction')
  programPath.unshiftContainer(
    'body',
    t.importDeclaration(
      [t.importSpecifier(interactionIdent, t.identifier('interaction'))],
      t.stringLiteral(importSource),
    ),
  )
  return interactionIdent
}

function addClientImports(
  programPath: babel.NodePath<t.Program>,
  source: string,
) {
  const lazyIdent = programPath.scope.generateUidIdentifier(
    'lazyHydratedComponent',
  )
  programPath.unshiftContainer('body', [
    t.importDeclaration(
      [t.importSpecifier(lazyIdent, t.identifier('lazyHydratedComponent'))],
      t.stringLiteral(source),
    ),
  ])
  return lazyIdent
}

function transformHydrateAst(options: {
  ast: t.File
  code: string
  id: string
  root: string
  env: 'client' | 'server'
  indexOffset?: number
}) {
  if (!options.code.includes('Hydrate')) return null

  const hydrateImport = getHydrateImport(options.ast)
  if (!hydrateImport) return null
  const { hydrateLocalName: localName } = hydrateImport
  const sourceId = cleanId(options.id)
  const getBoundaryId = createBoundaryId(options.root, sourceId)

  let nextBoundaryIndex = options.indexOffset ?? 0
  const state = { modified: false }
  let lazyIdent: t.Identifier | undefined
  let interactionIdent: t.Identifier | undefined

  babel.traverse(options.ast, {
    Program(programPath) {
      programPath.traverse({
        JSXElement(path) {
          if (getJSXElementName(path.node) !== localName) return

          if (options.env === 'server' && stripJSXAttribute(path, 'fallback')) {
            state.modified = true
          }

          const split = getBooleanProp(path.node.openingElement, 'split')
          if (split === false) return

          const boundaryInspection = inspectSplitBoundary({
            code: options.code,
            path,
            validate: true,
            collectCaptured: options.env === 'client',
            ...(options.env === 'client'
              ? {
                  nestedHydrate: {
                    localName,
                    interactionLocalNames: hydrateImport.interactionLocalNames,
                  },
                }
              : {}),
          })

          const index = nextBoundaryIndex
          const needsDelegatedInteraction =
            options.env === 'client' &&
            boundaryInspection.hasNestedInteraction &&
            !isInteractionCall(
              getWhenExpression(path.node.openingElement),
              hydrateImport.interactionLocalNames,
            )
          nextBoundaryIndex += 1 + boundaryInspection.nestedBoundaryCount
          const id = getBoundaryId(index)
          const exportName = `Hydrate_${index}`

          upsertSplitId(path.node.openingElement, id)
          if (needsDelegatedInteraction) {
            interactionIdent ??= getOrAddInteractionImport(
              programPath,
              hydrateImport.source,
            )
            path.node.openingElement.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier('__hydrate'),
                t.jsxExpressionContainer(
                  t.callExpression(interactionIdent, []),
                ),
              ),
            )
          }
          state.modified = true

          if (options.env === 'server') return

          if (!lazyIdent) {
            lazyIdent = addClientImports(programPath, hydrateImport.source)
          }

          const componentIdent =
            programPath.scope.generateUidIdentifier(exportName)
          const preloadIdent = programPath.scope.generateUidIdentifier(
            `${exportName}_preload`,
          )
          programPath.unshiftContainer('body', [
            t.variableDeclaration('const', [
              t.variableDeclarator(
                componentIdent,
                t.callExpression(lazyIdent, [
                  t.arrowFunctionExpression(
                    [],
                    t.callExpression(t.import(), [
                      t.stringLiteral(
                        createHydrateImportId(sourceId, id, index),
                      ),
                    ]),
                  ),
                  t.stringLiteral(exportName),
                ]),
              ),
              t.variableDeclarator(
                preloadIdent,
                t.memberExpression(componentIdent, t.identifier('preload')),
              ),
            ]),
          ])
          path.node.openingElement.attributes.push(
            t.jsxAttribute(
              t.jsxIdentifier('preload'),
              t.jsxExpressionContainer(preloadIdent),
            ),
          )

          path.node.children = [
            t.jsxText('\n'),
            t.jsxExpressionContainer(
              t.jsxElement(
                t.jsxOpeningElement(
                  t.jsxIdentifier(componentIdent.name),
                  boundaryInspection.captured.map((name) =>
                    t.jsxAttribute(
                      t.jsxIdentifier(name),
                      t.jsxExpressionContainer(t.identifier(name)),
                    ),
                  ),
                  true,
                ),
                null,
                [],
                true,
              ),
            ),
            t.jsxText('\n'),
          ]
          path.skip()
        },
      })
    },
  })

  if (!state.modified) return null

  return true
}

function loadHydrateVirtualModule(options: {
  id: string
  root: string
  code: string
}) {
  const { sourceId, splitId, boundaryIndex } = parseHydrateVirtualId(options.id)
  if (!splitId || boundaryIndex < 0) return null
  const getBoundaryId = createBoundaryId(options.root, sourceId)

  const ast = parseAst({ code: options.code, sourceFilename: sourceId })
  const hydrateImport = getHydrateImport(ast)
  if (!hydrateImport) return null
  const { hydrateLocalName: localName } = hydrateImport

  let target: t.JSXElement | undefined
  let targetIndex = -1
  let targetCaptured: Array<string> = []
  let index = 0

  babel.traverse(ast, {
    JSXElement(path) {
      if (getJSXElementName(path.node) !== localName) return
      const split = getBooleanProp(path.node.openingElement, 'split')
      if (split === false) return

      if (index === boundaryIndex) {
        const id = getBoundaryId(index)
        if (id !== splitId) {
          path.stop()
          return
        }
        targetCaptured = inspectSplitBoundary({
          code: options.code,
          path,
          collectCaptured: true,
        }).captured
        target = t.cloneNode(path.node, true)
        targetIndex = index
        path.stop()
        return
      }
      index++
    },
  })

  if (!target || targetIndex < 0) return null

  const children = target.children
  const exportName = `Hydrate_${targetIndex}`
  const refIdents = findReferencedIdentifiers(ast)

  removeModuleLevelBindings(ast, new Set(['Route']))
  const localBindings = new Set<string>()
  for (const node of ast.program.body) {
    collectLocalBindingsFromStatement(node, localBindings)
  }

  const keepBindings = new Set<string>()
  const fragment = t.jsxFragment(
    t.jsxOpeningFragment(),
    t.jsxClosingFragment(),
    children,
  )
  for (const name of collectIdentifiersFromNode(fragment)) {
    if (localBindings.has(name)) {
      keepBindings.add(name)
    }
  }

  if (keepBindings.size > 0) {
    expandTransitively(
      keepBindings,
      buildDependencyGraph(buildDeclarationMap(ast), localBindings),
    )
  }

  retainModuleLevelDeclarations(ast, keepBindings)
  unwrapExportedDeclarations(ast)

  ast.program.body.push(
    t.exportNamedDeclaration(
      t.functionDeclaration(
        t.identifier(exportName),
        [
          t.objectPattern(
            targetCaptured.map((name) =>
              t.objectProperty(
                t.identifier(name),
                t.identifier(name),
                false,
                true,
              ),
            ),
          ),
        ],
        t.blockStatement([t.returnStatement(fragment)]),
      ),
    ),
  )

  deadCodeElimination(ast, refIdents)
  stripUnreferencedTopLevelExpressionStatements(ast)

  const result = generateFromAst(ast, {
    sourceMaps: true,
    sourceFileName: options.id,
    filename: options.id,
  })
  return result
}

export function createHydrateCompilerPlugin(): StartCompilerPlugin {
  const sourcesByEnvironment = new Map<string, Map<string, string>>()

  const getEnvironmentSources = (envName: string) => {
    let sources = sourcesByEnvironment.get(envName)
    if (!sources) {
      sources = new Map()
      sourcesByEnvironment.set(envName, sources)
    }
    return sources
  }

  const setSource = (envName: string, id: string, code: string) => {
    getEnvironmentSources(envName).set(cleanId(id), code)
  }

  const getSource = (envName: string, id: string) =>
    sourcesByEnvironment.get(envName)?.get(cleanId(id))

  const deleteSource = (envName: string, id: string) => {
    sourcesByEnvironment.get(envName)?.delete(cleanId(id))
  }

  return {
    name: 'tanstack-start-core:hydrate',
    detect: HYDRATE_DETECTION_PATTERN,
    virtualModuleIdPattern: new RegExp(`[?&]${tssHydrate}=`),
    transformAst(context) {
      const virtualModule = parseHydrateVirtualId(context.id)
      const indexOffset =
        virtualModule.boundaryIndex < 0
          ? undefined
          : virtualModule.boundaryIndex + 1
      const result = transformHydrateAst({
        ast: context.ast,
        code: context.code,
        id: context.id,
        root: context.root,
        env: context.env,
        indexOffset,
      })

      if (result && virtualModule.boundaryIndex < 0) {
        setSource(context.envName, context.id, context.code)
      }

      return !!result
    },
    loadVirtualModule(context) {
      const virtualModule = parseHydrateVirtualId(context.id)
      if (!virtualModule.splitId || virtualModule.boundaryIndex < 0) {
        return null
      }

      const code =
        context.code ?? getSource(context.envName, virtualModule.sourceId)

      if (code === undefined) {
        throw new Error(
          `Missing Hydrate source for virtual module ${context.id}. The parent module must be transformed before its Hydrate child chunk is loaded.`,
        )
      }

      return loadHydrateVirtualModule({
        code,
        id: context.id,
        root: context.root,
      })
    },
    invalidateModule(context) {
      deleteSource(context.envName, context.id)
    },
  }
}
