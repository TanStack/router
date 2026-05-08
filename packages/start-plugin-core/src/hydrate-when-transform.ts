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
import type {
  CompileStartFrameworkOptions,
  StartCompilerPlugin,
  StartCompilerTransformResult,
} from './types'

type HydrationImport = {
  hydrateLocalName: string
  source: string
  interactionLocalNames: Set<string>
}

export class MissingHydrateSourceError extends Error {
  constructor(id: string) {
    super(
      `Missing Hydrate source for virtual module ${id}. The parent module must be transformed before its Hydrate child chunk is loaded.`,
    )
  }
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
  const sourceHash = crypto
    .createHash('sha1')
    .update(normalized)
    .digest('hex')
    .slice(0, 10)

  return (index: number) => {
    return `${index.toString(36)}_${sourceHash}`
  }
}

function parseBoundaryIndex(splitId: string | null) {
  if (!splitId) return -1
  const separatorIndex = splitId.indexOf('_')
  if (separatorIndex <= 0) return -1
  const boundaryIndex = Number.parseInt(splitId.slice(0, separatorIndex), 36)
  return Number.isInteger(boundaryIndex) ? boundaryIndex : -1
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

function mayHavePrefetchProp(node: t.JSXOpeningElement) {
  return node.attributes.some((attribute) => {
    if (t.isJSXSpreadAttribute(attribute)) return true
    return (
      t.isJSXAttribute(attribute) &&
      t.isJSXIdentifier(attribute.name, { name: 'prefetch' })
    )
  })
}

function parseHydrateVirtualId(id: string) {
  const queryIndex = id.indexOf('?')
  const sourceId = cleanId(queryIndex === -1 ? id : id.slice(0, queryIndex))
  if (queryIndex === -1) {
    return { sourceId, splitId: null, boundaryIndex: -1 }
  }

  const rawQuery = id.slice(queryIndex + 1)
  const params = new URLSearchParams(rawQuery)
  const splitId = params.get(tssHydrate)

  return {
    sourceId,
    splitId,
    boundaryIndex: parseBoundaryIndex(splitId),
  }
}

function createHydrateImportId(sourceId: string, id: string) {
  const params = new URLSearchParams()
  params.set(tssHydrate, id)
  return `${sourceId}?${params.toString()}`
}

function upsertHydrateId(node: t.JSXOpeningElement, id: string) {
  const existing = getJSXAttribute(node, 'h')

  if (existing) {
    existing.value = t.stringLiteral(id)
    return
  }

  node.attributes.push(
    t.jsxAttribute(t.jsxIdentifier('h'), t.stringLiteral(id)),
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
  framework: CompileStartFrameworkOptions,
) {
  const lazyIdent =
    programPath.scope.generateUidIdentifier('lazyRouteComponent')
  programPath.unshiftContainer('body', [
    t.importDeclaration(
      [t.importSpecifier(lazyIdent, t.identifier('lazyRouteComponent'))],
      t.stringLiteral(`@tanstack/${framework}-router`),
    ),
  ])
  return lazyIdent
}

function createReturnExpressionFromChildren(
  children: Array<t.JSXElement['children'][number]>,
) {
  const meaningfulChildren = children.filter(
    (child) => !(t.isJSXText(child) && child.value.trim() === ''),
  )

  if (meaningfulChildren.length === 0) return t.nullLiteral()
  if (meaningfulChildren.length === 1) {
    const child = meaningfulChildren[0]!
    if (t.isJSXExpressionContainer(child)) {
      return t.isJSXEmptyExpression(child.expression)
        ? t.nullLiteral()
        : child.expression
    }
    if (t.isJSXElement(child) || t.isJSXFragment(child)) return child
    if (t.isJSXText(child)) return t.stringLiteral(child.value)
  }

  return t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), children)
}

function transformHydrateAst(options: {
  ast: t.File
  code: string
  id: string
  root: string
  env: 'client' | 'server'
  framework: CompileStartFrameworkOptions
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

          if (options.env === 'server') {
            if (stripJSXAttribute(path, 'fallback')) {
              state.modified = true
            }
            if (stripJSXAttribute(path, 'prefetch')) {
              state.modified = true
            }
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

          const whenExpression = getWhenExpression(path.node.openingElement)
          const index = nextBoundaryIndex
          const needsDelegatedInteraction =
            options.env === 'client' &&
            boundaryInspection.hasNestedInteraction &&
            !isInteractionCall(
              whenExpression,
              hydrateImport.interactionLocalNames,
            )
          nextBoundaryIndex += 1 + boundaryInspection.nestedBoundaryCount
          const id = getBoundaryId(index)
          const exportName = `H${index}`
          const needsPreloadProp = mayHavePrefetchProp(path.node.openingElement)

          upsertHydrateId(path.node.openingElement, id)
          if (needsDelegatedInteraction) {
            interactionIdent ??= getOrAddInteractionImport(
              programPath,
              hydrateImport.source,
            )
            path.node.openingElement.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier('g'),
                t.jsxExpressionContainer(
                  t.callExpression(interactionIdent, []),
                ),
              ),
            )
          }
          state.modified = true

          if (options.env === 'server') return

          if (!lazyIdent) {
            lazyIdent = addClientImports(programPath, options.framework)
          }

          const componentIdent =
            programPath.scope.generateUidIdentifier(exportName)
          const declarations = [
            t.variableDeclarator(
              componentIdent,
              t.callExpression(lazyIdent, [
                t.arrowFunctionExpression(
                  [],
                  t.callExpression(t.import(), [
                    t.stringLiteral(createHydrateImportId(sourceId, id)),
                  ]),
                ),
                t.stringLiteral(exportName),
              ]),
            ),
          ]

          let preloadIdent: t.Identifier | undefined
          if (needsPreloadProp) {
            preloadIdent = programPath.scope.generateUidIdentifier(
              `${exportName}_preload`,
            )
            declarations.push(
              t.variableDeclarator(
                preloadIdent,
                t.memberExpression(componentIdent, t.identifier('preload')),
              ),
            )
          }

          programPath.unshiftContainer('body', [
            t.variableDeclaration('const', declarations),
          ])
          if (preloadIdent) {
            path.node.openingElement.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier('p'),
                t.jsxExpressionContainer(preloadIdent),
              ),
            )
          }

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
  const exportName = `H${targetIndex}`
  const refIdents = findReferencedIdentifiers(ast)

  removeModuleLevelBindings(ast, new Set(['Route']))
  const localBindings = new Set<string>()
  for (const node of ast.program.body) {
    collectLocalBindingsFromStatement(node, localBindings)
  }

  const keepBindings = new Set<string>()
  const returnExpression = createReturnExpressionFromChildren(children)
  for (const name of collectIdentifiersFromNode(returnExpression)) {
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
        targetCaptured.length > 0
          ? [
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
            ]
          : [],
        t.blockStatement([t.returnStatement(returnExpression)]),
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
  type SourceEntry = {
    code: string
    virtualModules: Map<string, StartCompilerTransformResult | null>
  }

  const sourcesByEnvironment = new Map<string, Map<string, SourceEntry>>()

  const getEnvironmentSources = (envName: string) => {
    let sources = sourcesByEnvironment.get(envName)
    if (!sources) {
      sources = new Map()
      sourcesByEnvironment.set(envName, sources)
    }
    return sources
  }

  const setSource = (envName: string, id: string, code: string) => {
    const sourceId = cleanId(id)
    const sources = getEnvironmentSources(envName)
    const existing = sources.get(sourceId)
    if (existing?.code === code) {
      return existing
    }

    const entry = {
      code,
      virtualModules: new Map<string, StartCompilerTransformResult | null>(),
    }
    sources.set(sourceId, entry)
    return entry
  }

  const getSourceEntry = (envName: string, id: string) =>
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
        framework: context.framework,
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

      const sourceEntry =
        context.code === undefined
          ? getSourceEntry(context.envName, virtualModule.sourceId)
          : setSource(context.envName, virtualModule.sourceId, context.code)

      if (!sourceEntry) {
        throw new MissingHydrateSourceError(context.id)
      }

      if (sourceEntry.virtualModules.has(context.id)) {
        return sourceEntry.virtualModules.get(context.id)!
      }

      const result = loadHydrateVirtualModule({
        code: sourceEntry.code,
        id: context.id,
        root: context.root,
      })
      sourceEntry.virtualModules.set(context.id, result)
      return result
    },
    invalidateModule(context) {
      deleteSource(context.envName, context.id)
    },
  }
}
