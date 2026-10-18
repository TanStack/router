import * as t from '@babel/types'
import * as babel from '@babel/core'
import * as template from '@babel/template'
import {
  buildDeclarationMap,
  buildDependencyGraph,
  collectIdentifiersFromPattern,
  collectLocalBindingsFromStatement,
  collectModuleLevelRefsFromNode,
  createIdentifier,
  deadCodeElimination,
  expandDestructuredDeclarations,
  expandSharedDestructuredDeclarators,
  expandTransitively,
  findReferencedIdentifiers,
  generateFromAst,
  parseAst,
  removeBindingsTransitivelyDependingOn,
  retainModuleLevelDeclarations,
  stripUnreferencedTopLevelExpressionStatements,
  unwrapExportedDeclarations,
} from '@tanstack/router-utils'
import { tsrShared, tsrSplit } from '../constants'
import { createRouteHmrStatement } from '../hmr'
import { getObjectPropertyKeyName } from '../utils'
import { getFrameworkOptions } from './framework-options'
import type {
  CodeSplitCompilerPlugin,
  CompileCodeSplitReferenceRouteOptions,
} from './plugins'
import type { GeneratorResult, ParseAstOptions } from '@tanstack/router-utils'
import type { CodeSplitGroupings, SplitRouteIdentNodes } from '../constants'
import type { SplitNodeMeta } from './types'

type Binding = NonNullable<ReturnType<babel.NodePath['scope']['getBinding']>>

export {
  buildDeclarationMap,
  buildDependencyGraph,
  collectIdentifiersFromNode,
  collectLocalBindingsFromStatement,
  collectModuleLevelRefsFromNode,
  expandDestructuredDeclarations,
  expandSharedDestructuredDeclarators,
  expandTransitively,
  removeBindingsTransitivelyDependingOn,
} from '@tanstack/router-utils'

export function removeBindingsDependingOnRoute(
  bindings: Set<string>,
  dependencyGraph: Map<string, Set<string>>,
) {
  removeBindingsTransitivelyDependingOn(bindings, dependencyGraph, ['Route'])
}

const SPLIT_NODES_CONFIG = new Map<SplitRouteIdentNodes, SplitNodeMeta>([
  [
    'loader',
    {
      routeIdent: 'loader',
      localImporterIdent: '$$splitLoaderImporter', // const $$splitLoaderImporter = () => import('...')
      splitStrategy: 'lazyFn',
      localExporterIdent: 'SplitLoader', // const SplitLoader = ...
      exporterIdent: 'loader', // export { SplitLoader as loader }
    },
  ],
  [
    'component',
    {
      routeIdent: 'component',
      localImporterIdent: '$$splitComponentImporter', // const $$splitComponentImporter = () => import('...')
      splitStrategy: 'lazyRouteComponent',
      localExporterIdent: 'SplitComponent', // const SplitComponent = ...
      exporterIdent: 'component', // export { SplitComponent as component }
    },
  ],
  [
    'pendingComponent',
    {
      routeIdent: 'pendingComponent',
      localImporterIdent: '$$splitPendingComponentImporter', // const $$splitPendingComponentImporter = () => import('...')
      splitStrategy: 'lazyRouteComponent',
      localExporterIdent: 'SplitPendingComponent', // const SplitPendingComponent = ...
      exporterIdent: 'pendingComponent', // export { SplitPendingComponent as pendingComponent }
    },
  ],
  [
    'errorComponent',
    {
      routeIdent: 'errorComponent',
      localImporterIdent: '$$splitErrorComponentImporter', // const $$splitErrorComponentImporter = () => import('...')
      splitStrategy: 'lazyRouteComponent',
      localExporterIdent: 'SplitErrorComponent', // const SplitErrorComponent = ...
      exporterIdent: 'errorComponent', // export { SplitErrorComponent as errorComponent }
    },
  ],
  [
    'notFoundComponent',
    {
      routeIdent: 'notFoundComponent',
      localImporterIdent: '$$splitNotFoundComponentImporter', // const $$splitNotFoundComponentImporter = () => import('...')
      splitStrategy: 'lazyRouteComponent',
      localExporterIdent: 'SplitNotFoundComponent', // const SplitNotFoundComponent = ...
      exporterIdent: 'notFoundComponent', // export { SplitNotFoundComponent as notFoundComponent }
    },
  ],
])

/**
 * The expression inside transparent TypeScript wrappers and parentheses:
 * `x satisfies T`, `x as T`, `<T>x`, `x!` and `(x)` all evaluate to `x`.
 */
function unwrapTransparentExpression(node: t.Node): t.Node {
  let current = node

  while (
    t.isTSSatisfiesExpression(current) ||
    t.isTSAsExpression(current) ||
    t.isTSTypeAssertion(current) ||
    t.isTSNonNullExpression(current) ||
    t.isParenthesizedExpression(current)
  ) {
    current = current.expression
  }

  return current
}

/**
 * The handler of an inline object-form loader, or a statically known function
 * loader. Opaque values stay eager because they may carry lifecycle metadata.
 */
function getLoaderSplitValue(
  path: babel.NodePath,
  value: t.Node,
): t.Node | undefined {
  const node = unwrapTransparentExpression(value)

  if (t.isObjectExpression(node)) {
    let handler: t.ObjectProperty | t.ObjectMethod | undefined
    for (const member of node.properties) {
      if (
        !t.isSpreadElement(member) &&
        getObjectPropertyKeyName(member) === 'handler'
      ) {
        handler = member
      }
    }

    if (
      t.isObjectMethod(handler)
        ? handler.kind !== 'method' ||
          // Moving a method using `super` would change its home object.
          t.traverseFast(handler, (child) =>
            t.isSuper(child) ? t.traverseFast.stop : undefined,
          )
        : handler &&
          isFallbackLiteral(unwrapTransparentExpression(handler.value))
    ) {
      return undefined
    }

    return handler
  }

  let fn: t.Node = node
  if (t.isIdentifier(node)) {
    const binding = path.scope.getBinding(node.name)
    if (!binding?.constant) {
      return undefined
    }
    const declaration = binding.path.node
    fn =
      t.isVariableDeclarator(declaration) &&
      t.isIdentifier(declaration.id) &&
      declaration.init
        ? unwrapTransparentExpression(declaration.init)
        : declaration
  }

  return t.isFunctionDeclaration(fn) ||
    t.isFunctionExpression(fn) ||
    t.isArrowFunctionExpression(fn)
    ? node
    : undefined
}

/**
 * The expression that holds a `handler` member's function: the value of
 * `handler: fn`, or `handler() {}` turned into a function expression so it
 * can be exported from the split file on its own.
 */
function getHandlerExpression(
  handler: t.ObjectProperty | t.ObjectMethod,
): t.Node {
  if (t.isObjectProperty(handler)) {
    return handler.value
  }

  const fn = t.functionExpression(
    null,
    handler.params,
    handler.body,
    handler.generator,
    handler.async,
  )
  fn.returnType = handler.returnType
  fn.typeParameters = handler.typeParameters

  return fn
}

/**
 * `true`, `false`, `null` and `undefined` mean "no value here, fall back":
 * such a value is kept in the reference file instead of being split.
 */
function isFallbackLiteral(node: t.Node): boolean {
  return (
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    (t.isIdentifier(node) && node.name === 'undefined')
  )
}

/**
 * Whether a reference sits in a TypeScript type (`typeof postsLoader`),
 * which is erased before the code runs.
 */
function isTypeReference(reference: babel.NodePath): boolean {
  return reference.findParent((parent) => parent.isTSType()) !== null
}

/**
 * Whether `key` is an option split with `lazyFn` (`loader`, which has an
 * object form) and is in one of the split groups.
 */
function isSplitLazyFnKey(
  key: string | undefined,
  codeSplitGroupings: CodeSplitGroupings,
): boolean {
  return (
    SPLIT_NODES_CONFIG.get(key as SplitRouteIdentNodes)?.splitStrategy ===
      'lazyFn' && codeSplitGroupings.some((group) => group.includes(key as any))
  )
}

/**
 * The route options argument of a route factory call,
 * `createFileRoute('/')({ ... })` or `const Route = createFileRoute({ ... })`,
 * resolved through a same-file variable (`resolveIdentifier`).
 */
function resolveRouteOptions(
  path: babel.NodePath<t.CallExpression>,
): t.Node | undefined {
  const parent = path.parentPath.node

  if (t.isCallExpression(parent)) {
    return resolveIdentifier(path, parent.arguments[0])
  }

  // the call is the declarator's `init`
  return t.isVariableDeclarator(parent)
    ? resolveIdentifier(path, path.node.arguments[0])
    : undefined
}

/**
 * The route options object literal of the file's `createFileRoute` call,
 * written inline or held in a same-file variable, with the call's path for
 * scope lookups. `undefined` when there is none.
 */
function findRouteOptions(
  ast: t.File,
): { routeOptions: t.ObjectExpression; callPath: babel.NodePath } | undefined {
  let found:
    | { routeOptions: t.ObjectExpression; callPath: babel.NodePath }
    | undefined

  babel.traverse(ast, {
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee)) {
        return
      }

      if (!splittableCreateRouteFns.includes(path.node.callee.name)) {
        return
      }

      const options = resolveRouteOptions(path)

      if (t.isObjectExpression(options)) {
        found = { routeOptions: options, callPath: path }
      }
    },
  })

  return found
}

function addSplitSearchParamToFilename(
  filename: string,
  grouping: Array<string>,
) {
  const [bareFilename] = filename.split('?')

  const params = new URLSearchParams()
  params.append(tsrSplit, createIdentifier(grouping))

  const result = `${bareFilename}?${params.toString()}`
  return result
}

function removeSplitSearchParamFromFilename(filename: string) {
  const [bareFilename] = filename.split('?')
  return bareFilename!
}

export function addSharedSearchParamToFilename(filename: string) {
  const [bareFilename] = filename.split('?')
  return `${bareFilename}?${tsrShared}=1`
}

const splittableCreateRouteFns = ['createFileRoute']
const unsplittableCreateRouteFns = [
  'createRootRoute',
  'createRootRouteWithContext',
]
const allCreateRouteFns = [
  ...splittableCreateRouteFns,
  ...unsplittableCreateRouteFns,
]

/**
 * Computes module-level bindings that are shared between split and non-split
 * route properties. These bindings need to be extracted into a shared virtual
 * module to avoid double-initialization.
 *
 * A binding is "shared" if it is referenced by at least one split property
 * AND at least one non-split property. Only locally-declared module-level
 * bindings are candidates (not imports — bundlers dedupe those).
 */
export function computeSharedBindings(opts: {
  code: string
  filename?: string
  codeSplitGroupings: CodeSplitGroupings
  /** The environment's `deleteNodes`: deleted keys share nothing. */
  deleteNodes?: ReadonlySet<string>
}): Set<string> {
  const ast = parseAst(opts)

  // Early bailout: collect all module-level locally-declared binding names.
  // This is a cheap loop over program.body (no traversal). If the file has
  // no local bindings (aside from `Route`), nothing can be shared — skip
  // the expensive babel.traverse entirely.
  const localModuleLevelBindings = new Set<string>()
  for (const node of ast.program.body) {
    collectLocalBindingsFromStatement(node, localModuleLevelBindings)
  }

  // File-based routes always export a route config binding (usually `Route`).
  // This must never be extracted into the shared module.
  localModuleLevelBindings.delete('Route')

  if (localModuleLevelBindings.size === 0) {
    return new Set()
  }

  // Find the route options object and scope of same-file function loaders.
  const route = findRouteOptions(ast)

  if (!route) {
    return new Set()
  }

  const { routeOptions, callPath } = route

  // Deleted inline properties read no bindings in this environment.
  const deleteNodesTree = buildDeleteNodesTree(opts.deleteNodes)
  if (deleteNodesTree) {
    deleteObjectProperties(routeOptions, deleteNodesTree)
  }

  // Each part of the route options with the group it ends up in (-1: the
  // reference file): a split key's value in its group, unless it is an
  // exported identifier, which both compiles keep in the reference file; for
  // an object-form loader split by its handler, the handler in the loader's
  // group and every other member in the reference file.
  const parts: Array<[node: t.Node, groupIndex: number]> = []
  const pushSplitPart = (node: t.Node, groupIndex: number) => {
    const value = unwrapTransparentExpression(
      t.isObjectProperty(node) ? node.value : node,
    )
    const exported =
      groupIndex !== -1 && t.isIdentifier(value) && hasExport(ast, value)
    parts.push([node, exported ? -1 : groupIndex])
  }
  for (const prop of routeOptions.properties) {
    if (!t.isObjectProperty(prop)) continue
    const key = getObjectPropertyKeyName(prop)
    if (!key || key === 'codeSplitGroupings') continue
    if (t.isIdentifier(prop.value) && prop.value.name === 'undefined') continue
    const groupIndex = opts.codeSplitGroupings.findIndex((group) =>
      group.includes(key as any),
    )
    if (!isSplitLazyFnKey(key, opts.codeSplitGroupings)) {
      pushSplitPart(prop.value, groupIndex)
      continue
    }

    const splitValue = getLoaderSplitValue(callPath, prop.value)
    if (!splitValue) {
      parts.push([prop.value, -1])
      continue
    }

    const value = unwrapTransparentExpression(prop.value)
    if (t.isObjectExpression(value)) {
      for (const member of value.properties) {
        if (member === splitValue) {
          pushSplitPart(member, groupIndex)
        } else {
          parts.push([member, -1])
        }
      }
    } else {
      pushSplitPart(prop.value, groupIndex)
    }
  }

  // Fast path: a binding is shared when two groups read it, so with fewer
  // than two groups nothing is.
  const firstGroupIndex = parts[0]?.[1]
  if (parts.every(([, groupIndex]) => groupIndex === firstGroupIndex)) {
    return new Set()
  }

  // Build dependency graph up front — needed for transitive expansion per-property.
  // This graph excludes `Route` (deleted above) so group attribution works correctly.
  const declMap = buildDeclarationMap(ast)
  const depGraph = buildDependencyGraph(declMap, localModuleLevelBindings)

  // Build a second dependency graph that includes `Route` so we can detect
  // bindings that transitively depend on it. Such bindings must NOT be
  // extracted into the shared module because they would drag the Route
  // singleton with them, duplicating it across modules.
  const allLocalBindings = new Set(localModuleLevelBindings)
  allLocalBindings.add('Route')
  const fullDepGraph = buildDependencyGraph(declMap, allLocalBindings)

  // Track which groups read each binding. We expand each part's refs
  // transitively BEFORE comparing groups, so indirect refs (e.g., component:
  // MyComp where MyComp uses `shared`) are correctly attributed.
  const refsByGroup = new Map<string, Set<number>>()

  for (const [part, groupIndex] of parts) {
    const allRefs = collectModuleLevelRefsFromNode(
      part,
      localModuleLevelBindings,
    )
    expandTransitively(allRefs, depGraph)

    for (const ref of allRefs) {
      let groups = refsByGroup.get(ref)
      if (!groups) {
        groups = new Set()
        refsByGroup.set(ref, groups)
      }
      groups.add(groupIndex)
    }
  }

  // Shared = bindings appearing in 2+ distinct groups
  const shared = new Set<string>()
  for (const [name, groups] of refsByGroup) {
    if (groups.size >= 2) shared.add(name)
  }

  // Destructured declarators (e.g. `const { a, b } = fn()`) must be treated
  // as a single initialization unit. Even if each binding is referenced by
  // only one group, if *different* bindings from the same declarator are
  // referenced by different groups, the declarator must be extracted to the
  // shared module to avoid double initialization.
  expandSharedDestructuredDeclarators(ast, refsByGroup, shared)

  if (shared.size === 0) return shared

  // If any binding from a destructured declaration is shared,
  // all bindings from that declaration must be shared
  expandDestructuredDeclarations(ast, shared)

  // Remove shared bindings that transitively depend on `Route`.
  // The Route singleton must stay in the reference file; extracting a
  // binding that references it would duplicate Route in the shared module.
  removeBindingsTransitivelyDependingOn(shared, fullDepGraph, ['Route'])

  return shared
}

/**
 * Find which shared bindings are user-exported in the original source.
 * These need to be re-exported from the shared module.
 */
function findExportedSharedBindings(
  ast: t.File,
  sharedBindings: Set<string>,
): Set<string> {
  const exported = new Set<string>()
  for (const stmt of ast.program.body) {
    if (!t.isExportNamedDeclaration(stmt) || !stmt.declaration) continue

    if (t.isVariableDeclaration(stmt.declaration)) {
      for (const decl of stmt.declaration.declarations) {
        for (const name of collectIdentifiersFromPattern(decl.id)) {
          if (sharedBindings.has(name)) exported.add(name)
        }
      }
    } else if (
      t.isFunctionDeclaration(stmt.declaration) &&
      stmt.declaration.id
    ) {
      if (sharedBindings.has(stmt.declaration.id.name))
        exported.add(stmt.declaration.id.name)
    } else if (t.isClassDeclaration(stmt.declaration) && stmt.declaration.id) {
      if (sharedBindings.has(stmt.declaration.id.name))
        exported.add(stmt.declaration.id.name)
    }
  }
  return exported
}

/**
 * Remove declarations of shared bindings from the AST.
 * Handles both plain and exported declarations, including destructured patterns.
 * Removes the entire statement if all bindings in it are shared.
 */
function removeSharedDeclarations(ast: t.File, sharedBindings: Set<string>) {
  ast.program.body = ast.program.body.filter((stmt) => {
    const decl =
      t.isExportNamedDeclaration(stmt) && stmt.declaration
        ? stmt.declaration
        : stmt

    if (t.isVariableDeclaration(decl)) {
      // Filter out declarators where all bound names are shared
      decl.declarations = decl.declarations.filter((declarator) => {
        const names = collectIdentifiersFromPattern(declarator.id)
        return !names.every((n) => sharedBindings.has(n))
      })
      // If no declarators remain, remove the entire statement
      if (decl.declarations.length === 0) return false
    } else if (t.isFunctionDeclaration(decl) && decl.id) {
      if (sharedBindings.has(decl.id.name)) return false
    } else if (t.isClassDeclaration(decl) && decl.id) {
      if (sharedBindings.has(decl.id.name)) return false
    }

    return true
  })
}

/**
 * The keys `deleteNodes` removes from a route options object literal, as a
 * tree: `null` deletes the key itself, a nested tree descends into the key's
 * object-literal value. `'ssr'` and `'loader.dehydrate'` become
 * `{ ssr: null, loader: { dehydrate: null } }`.
 */
type DeleteNodesTree = Map<string, DeleteNodesTree | null>

function buildDeleteNodesTree(
  deleteNodes: ReadonlySet<string> | undefined,
): DeleteNodesTree | undefined {
  if (!deleteNodes || deleteNodes.size === 0) {
    return undefined
  }

  const root: DeleteNodesTree = new Map()

  for (const dotPath of deleteNodes) {
    const segments = dotPath.split('.').filter(Boolean)
    let tree = root

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!
      const existing = tree.get(segment)

      // the whole key is already deleted; a nested path adds nothing
      if (existing === null) {
        break
      }

      if (i === segments.length - 1) {
        tree.set(segment, null)
        break
      }

      if (existing) {
        tree = existing
      } else {
        const child: DeleteNodesTree = new Map()
        tree.set(segment, child)
        tree = child
      }
    }
  }

  return root.size > 0 ? root : undefined
}

/**
 * Removes the members of `objectExpression` named in `tree`, descending into
 * object-literal values for nested paths, through transparent TypeScript
 * wrappers (`{ ... } satisfies T`, `{ ... } as const`, `({ ... })`).
 * Spreads, computed keys and opaque values (identifiers, calls, functions) are
 * left as they are. Returns whether anything was removed.
 */
function deleteObjectProperties(
  objectExpression: t.ObjectExpression,
  tree: DeleteNodesTree,
): boolean {
  let modified = false

  objectExpression.properties = objectExpression.properties.filter((prop) => {
    const key = t.isSpreadElement(prop)
      ? undefined
      : getObjectPropertyKeyName(prop)
    const entry = key === undefined ? undefined : tree.get(key)

    if (entry === undefined) {
      return true
    }

    if (entry === null) {
      modified = true
      return false
    }

    if (!t.isObjectProperty(prop)) {
      return true
    }

    const value = unwrapTransparentExpression(prop.value)
    if (t.isObjectExpression(value) && deleteObjectProperties(value, entry)) {
      modified = true
    }

    return true
  })

  return modified
}

export function compileCodeSplitReferenceRoute(
  opts: ParseAstOptions &
    CompileCodeSplitReferenceRouteOptions & {
      compilerPlugins?: Array<CodeSplitCompilerPlugin>
    },
): GeneratorResult | null {
  const ast = parseAst(opts)

  const refIdents = findReferencedIdentifiers(ast)

  const knownExportedIdents = new Set<string>()
  // split values written as an identifier; their declarations and imports are
  // removed after dead-code elimination unless code left here reads them
  const splitIdentifiers = new Set<string>()
  const deleteNodesTree = buildDeleteNodesTree(opts.deleteNodes)

  function findIndexForSplitNode(str: string) {
    return opts.codeSplitGroupings.findIndex((group) =>
      group.includes(str as any),
    )
  }

  const frameworkOptions = getFrameworkOptions(opts.targetFramework)
  const PACKAGE = frameworkOptions.package
  const LAZY_ROUTE_COMPONENT_IDENT = frameworkOptions.idents.lazyRouteComponent
  const LAZY_FN_IDENT = frameworkOptions.idents.lazyFn
  const stableRouteOptionKeys = [
    ...new Set(
      (opts.compilerPlugins ?? []).flatMap(
        (plugin) => plugin.getStableRouteOptionKeys?.() ?? [],
      ),
    ),
  ]

  let createRouteFn: string

  let modified = false as boolean
  let hmrAdded = false as boolean
  let sharedExportedNames: Set<string> | undefined
  babel.traverse(ast, {
    Program: {
      enter(programPath) {
        programPath.traverse({
          CallExpression: (path) => {
            if (!t.isIdentifier(path.node.callee)) {
              return
            }

            if (!allCreateRouteFns.includes(path.node.callee.name)) {
              return
            }

            createRouteFn = path.node.callee.name

            function babelHandleReference(routeOptions: t.Node | undefined) {
              // Prepends the declaration of `name` unless the program already
              // has it (the scope is crawled after each split)
              const declareOnce = (name: string, code: string) => {
                if (!programPath.scope.hasBinding(name)) {
                  programPath.unshiftContainer(
                    'body',
                    template.statement(code)(),
                  )
                }
              }

              const addRouteHmr = (
                insertionPath: babel.NodePath,
                routeOptions: t.ObjectExpression,
              ) => {
                if (!opts.addHmr || hmrAdded) {
                  return
                }

                opts.compilerPlugins?.forEach((plugin) => {
                  const pluginResult = plugin.onAddHmr?.({
                    programPath,
                    callExpressionPath: path,
                    insertionPath,
                    routeOptions,
                    createRouteFn,
                    opts: opts as CompileCodeSplitReferenceRouteOptions,
                  })

                  if (pluginResult?.modified) {
                    modified = true
                  }
                })

                programPath.pushContainer(
                  'body',
                  createRouteHmrStatement(stableRouteOptionKeys, {
                    hmrStyle: opts.hmrStyle ?? 'vite',
                    targetFramework: opts.targetFramework,
                    routeId: opts.hmrRouteId,
                  }),
                )
                modified = true
                hmrAdded = true
              }

              if (t.isObjectExpression(routeOptions)) {
                const insertionPath = path.getStatementParent() ?? path

                opts.compilerPlugins?.forEach((plugin) => {
                  const pluginResult = plugin.onRouteOptions?.({
                    programPath,
                    callExpressionPath: path,
                    insertionPath,
                    routeOptions,
                    createRouteFn,
                    opts: opts as CompileCodeSplitReferenceRouteOptions,
                  })

                  if (pluginResult?.modified) {
                    modified = true
                  }
                })

                if (
                  deleteNodesTree &&
                  deleteObjectProperties(routeOptions, deleteNodesTree)
                ) {
                  modified = true
                }
                if (!splittableCreateRouteFns.includes(createRouteFn)) {
                  opts.compilerPlugins?.forEach((plugin) => {
                    const pluginResult = plugin.onUnsplittableRoute?.({
                      programPath,
                      callExpressionPath: path,
                      insertionPath,
                      routeOptions,
                      createRouteFn,
                      opts: opts as CompileCodeSplitReferenceRouteOptions,
                    })

                    if (pluginResult?.modified) {
                      modified = true
                    }
                  })

                  // we can't split this route but we still add HMR handling if enabled
                  addRouteHmr(insertionPath, routeOptions)
                  // exit traversal so this route is not split
                  return programPath.stop()
                }

                // Splitting a preceding option re-crawls scope. Decide from
                // the original bindings so reference and virtual agree even
                // when removed code assigned to a function loader.
                const loaderSplitValues = new Map<
                  t.ObjectProperty,
                  t.Node | undefined
                >()
                for (const prop of routeOptions.properties) {
                  if (
                    t.isObjectProperty(prop) &&
                    isSplitLazyFnKey(
                      getObjectPropertyKeyName(prop),
                      opts.codeSplitGroupings,
                    )
                  ) {
                    loaderSplitValues.set(
                      prop,
                      getLoaderSplitValue(path, prop.value),
                    )
                  }
                }

                routeOptions.properties.forEach((prop) => {
                  if (t.isObjectProperty(prop)) {
                    const key = getObjectPropertyKeyName(prop)

                    if (key) {
                      // If the user has not specified a split grouping for this key
                      // then we should not split it
                      const codeSplitGroupingByKey = findIndexForSplitNode(key)
                      if (codeSplitGroupingByKey === -1) {
                        return
                      }
                      const codeSplitGroup = [
                        ...new Set(
                          opts.codeSplitGroupings[codeSplitGroupingByKey],
                        ),
                      ]

                      // find key in nodeSplitConfig
                      const isNodeConfigAvailable = SPLIT_NODES_CONFIG.has(
                        key as any,
                      )

                      if (!isNodeConfigAvailable) {
                        return
                      }

                      // Exit early if the value is a boolean, null, or undefined,
                      // also under a TypeScript wrapper (`undefined as any`),
                      // which the split file sees through as well.
                      // These values mean "don't use this component, fallback to parent"
                      // No code splitting needed to preserve fallback behavior
                      if (
                        isFallbackLiteral(
                          unwrapTransparentExpression(prop.value),
                        )
                      ) {
                        return
                      }

                      const splitNodeMeta = SPLIT_NODES_CONFIG.get(key as any)!

                      const splitValue =
                        splitNodeMeta.splitStrategy === 'lazyFn'
                          ? loaderSplitValues.get(prop)
                          : prop.value
                      if (!splitValue) {
                        return
                      }

                      const handler =
                        t.isObjectProperty(splitValue) ||
                        t.isObjectMethod(splitValue)
                          ? splitValue
                          : undefined
                      const value = t.isObjectMethod(handler)
                        ? handler
                        : unwrapTransparentExpression(
                            handler ? handler.value : splitValue,
                          )

                      if (t.isIdentifier(value)) {
                        // exported identifiers should not be split
                        // since they are already being imported
                        // and need to be retained in the compiled file
                        if (hasExport(ast, value)) {
                          knownExportedIdents.add(value.name)
                          return
                        }

                        splitIdentifiers.add(value.name)
                      }

                      modified = true

                      // We need to extract the existing search params from the filename, if any
                      // and add the relevant codesplitPrefix to them, then write them back to the filename
                      const splitUrl = addSplitSearchParamToFilename(
                        opts.filename,
                        codeSplitGroup,
                      )

                      // Prepend the import of the split helper and the
                      // importer function with the dynamic import
                      const helperIdent =
                        splitNodeMeta.splitStrategy === 'lazyRouteComponent'
                          ? LAZY_ROUTE_COMPONENT_IDENT
                          : LAZY_FN_IDENT
                      declareOnce(
                        helperIdent,
                        `import { ${helperIdent} } from '${PACKAGE}'`,
                      )
                      declareOnce(
                        splitNodeMeta.localImporterIdent,
                        `const ${splitNodeMeta.localImporterIdent} = () => import('${splitUrl}')`,
                      )

                      if (
                        splitNodeMeta.splitStrategy === 'lazyRouteComponent'
                      ) {
                        const insertionPath = path.getStatementParent() ?? path
                        let splitPropValue: t.Expression | undefined

                        for (const plugin of opts.compilerPlugins ?? []) {
                          const pluginPropValue = plugin.onSplitRouteProperty?.(
                            {
                              programPath,
                              callExpressionPath: path,
                              insertionPath,
                              routeOptions,
                              prop,
                              splitNodeMeta,
                              lazyRouteComponentIdent:
                                LAZY_ROUTE_COMPONENT_IDENT,
                              opts,
                            },
                          )

                          if (!pluginPropValue) {
                            continue
                          }

                          modified = true
                          splitPropValue = pluginPropValue
                          break
                        }

                        if (splitPropValue) {
                          prop.value = splitPropValue
                        } else {
                          prop.value = template.expression(
                            `${LAZY_ROUTE_COMPONENT_IDENT}(${splitNodeMeta.localImporterIdent}, '${splitNodeMeta.exporterIdent}')`,
                          )()
                        }

                        // add HMR handling
                        addRouteHmr(insertionPath, routeOptions)
                      } else {
                        // if (splitNodeMeta.splitStrategy === 'lazyFn') {
                        // Add the lazyFn call with the dynamic import to the prop value
                        const lazyFnCall = template.expression(
                          `${LAZY_FN_IDENT}(${splitNodeMeta.localImporterIdent}, '${splitNodeMeta.exporterIdent}')`,
                        )()

                        if (!handler) {
                          prop.value = lazyFnCall
                        } else if (t.isObjectProperty(handler)) {
                          handler.value = lazyFnCall
                        } else {
                          // `handler() {}` becomes `handler: lazyFn(...)`
                          const object = unwrapTransparentExpression(
                            prop.value,
                          ) as t.ObjectExpression
                          const members = object.properties
                          members[members.indexOf(handler)] = t.objectProperty(
                            t.identifier('handler'),
                            lazyFnCall,
                          )
                        }
                      }
                    }
                  }

                  programPath.scope.crawl()
                })

                addRouteHmr(insertionPath, routeOptions)
              }
            }

            babelHandleReference(resolveRouteOptions(path))
          },
        })

        // Handle shared bindings inside the Program visitor so we have
        // access to programPath for cheap refIdents registration.
        if (opts.sharedBindings && opts.sharedBindings.size > 0) {
          sharedExportedNames = findExportedSharedBindings(
            ast,
            opts.sharedBindings,
          )
          removeSharedDeclarations(ast, opts.sharedBindings)

          const sharedModuleUrl = addSharedSearchParamToFilename(opts.filename)

          const sharedImportSpecifiers = [...opts.sharedBindings].map((name) =>
            t.importSpecifier(t.identifier(name), t.identifier(name)),
          )
          const [sharedImportPath] = programPath.unshiftContainer(
            'body',
            t.importDeclaration(
              sharedImportSpecifiers,
              t.stringLiteral(sharedModuleUrl),
            ),
          )

          // Register import specifier locals in refIdents so DCE can remove unused ones
          sharedImportPath.traverse({
            Identifier(identPath) {
              if (
                identPath.parentPath.isImportSpecifier() &&
                identPath.key === 'local'
              ) {
                refIdents.add(identPath)
              }
            },
          })

          // Re-export user-exported shared bindings from the shared module
          if (sharedExportedNames.size > 0) {
            const reExportSpecifiers = [...sharedExportedNames].map((name) =>
              t.exportSpecifier(t.identifier(name), t.identifier(name)),
            )
            programPath.pushContainer(
              'body',
              t.exportNamedDeclaration(
                null,
                reExportSpecifiers,
                t.stringLiteral(sharedModuleUrl),
              ),
            )
          }
        }
      },
    },
  })

  if (!modified) {
    return null
  }

  deadCodeElimination(ast, refIdents)

  // A split value's declaration or import moves to the split file. It stays
  // while code left here reads it (`head: () => ({ meta: [{ title:
  // PostsComponent.title }] })`, top-level `PostsComponent.displayName =
  // 'Posts'`); a local one a key left here reads is then taken from the shared
  // module. Types do not count: they are erased, but under
  // `verbatimModuleSyntax` an import only they read would load its module with
  // the route. Checked after dead-code elimination, so a reader removed with
  // the split code (a helper only the split component used) does not count.
  let removedSplitBinding = false as boolean
  babel.traverse(ast, {
    Program(programPath) {
      programPath.scope.crawl()
      for (const name of splitIdentifiers) {
        const binding = programPath.scope.getBinding(name)
        if (binding?.referencePaths.every(isTypeReference)) {
          removeBinding(binding, name)
          removedSplitBinding = true
        }
      }
      programPath.stop()
    },
  })
  if (removedSplitBinding) {
    deadCodeElimination(ast, refIdents)
  }

  // if there are exported identifiers, then we need to add a warning
  // to the file to let the user know that the exported identifiers
  // will not in the split file but in the original file, therefore
  // increasing the bundle size
  if (knownExportedIdents.size > 0) {
    const warningMessage = createNotExportableMessage(
      opts.filename,
      knownExportedIdents,
    )
    console.warn(warningMessage)

    // append this warning to the file using a template
    if (process.env.NODE_ENV !== 'production') {
      const warningTemplate = template.statement(
        `console.warn(${JSON.stringify(warningMessage)})`,
      )()
      ast.program.body.unshift(warningTemplate)
    }
  }

  const result = generateFromAst(ast, {
    sourceMaps: true,
    sourceFileName: opts.filename,
    filename: opts.filename,
  })

  // @babel/generator does not populate sourcesContent because it only has
  // the AST, not the original text.  Without this, Vite's composed
  // sourcemap omits the original source, causing downstream consumers
  // (e.g. import-protection snippet display) to fall back to the shorter
  // compiled output and fail to resolve original line numbers.
  if (result.map) {
    result.map.sourcesContent = [opts.code]
  }

  return result
}

export function compileCodeSplitVirtualRoute(
  opts: ParseAstOptions & {
    splitTargets: Array<SplitRouteIdentNodes>
    filename: string
    sharedBindings?: Set<string>
    compilerPlugins?: Array<CodeSplitCompilerPlugin>
    deleteNodes?: ReadonlySet<string>
  },
): GeneratorResult {
  const ast = parseAst(opts)
  const refIdents = findReferencedIdentifiers(ast)
  const deleteNodesTree = buildDeleteNodesTree(opts.deleteNodes)

  // Remove shared declarations BEFORE babel.traverse so the scope never sees
  // conflicting bindings (avoids checkBlockScopedCollisions crash in DCE)
  if (opts.sharedBindings && opts.sharedBindings.size > 0) {
    removeSharedDeclarations(ast, opts.sharedBindings)
  }

  const intendedSplitNodes = new Set(opts.splitTargets)

  const knownExportedIdents = new Set<string>()

  babel.traverse(ast, {
    Program: {
      enter(programPath) {
        const trackedNodesToSplitByType: Record<
          SplitRouteIdentNodes,
          { node: t.Node | undefined; meta: SplitNodeMeta } | undefined
        > = {
          component: undefined,
          loader: undefined,
          pendingComponent: undefined,
          errorComponent: undefined,
          notFoundComponent: undefined,
        }

        // Find and track all the known split-able nodes
        programPath.traverse({
          CallExpression: (path) => {
            if (!t.isIdentifier(path.node.callee)) {
              return
            }

            if (!splittableCreateRouteFns.includes(path.node.callee.name)) {
              return
            }

            function babelHandleVirtual(options: t.Node | undefined) {
              if (t.isObjectExpression(options)) {
                if (deleteNodesTree) {
                  deleteObjectProperties(options, deleteNodesTree)
                }
                options.properties.forEach((prop) => {
                  if (!t.isObjectProperty(prop)) {
                    return
                  }

                  // do not use `intendedSplitNodes` here
                  // since we have special considerations that need
                  // to be accounted for like (not splitting exported identifiers)
                  const meta = SPLIT_NODES_CONFIG.get(
                    getObjectPropertyKeyName(prop) as SplitRouteIdentNodes,
                  )

                  if (!meta) {
                    return
                  }

                  const originalValue = unwrapTransparentExpression(prop.value)
                  if (
                    t.isIdentifier(originalValue) &&
                    hasExport(ast, originalValue)
                  ) {
                    knownExportedIdents.add(originalValue.name)
                    return
                  }

                  const splitValue =
                    meta.splitStrategy === 'lazyFn'
                      ? getLoaderSplitValue(path, prop.value)
                      : prop.value
                  if (!splitValue) {
                    return
                  }

                  let value = splitValue
                  if (
                    t.isObjectProperty(splitValue) ||
                    t.isObjectMethod(splitValue)
                  ) {
                    // Detach the handler before the route options are removed.
                    const object = unwrapTransparentExpression(
                      prop.value,
                    ) as t.ObjectExpression
                    object.properties.splice(
                      object.properties.indexOf(splitValue),
                      1,
                    )
                    value = getHandlerExpression(splitValue)
                  }

                  // `x satisfies T`, `x as T`, `x!`, `(x)`: unwrapped
                  // as in the reference file, which replaces the wrapper
                  // with the value
                  value = unwrapTransparentExpression(value)

                  // If the value for the `key` is `undefined` (or another
                  // fallback literal), then we don't need to include it
                  // in the split file, so we can just return, since it will kept in-place in the
                  // reference file
                  // This is useful for cases like: `createFileRoute('/')({ component: undefined })`
                  if (isFallbackLiteral(value)) {
                    return
                  }

                  // An exported value stays in the reference file; its
                  // export is removed from this file once every option
                  // is read (`export const { component, loader } = ...`
                  // exports both from one statement)
                  if (t.isIdentifier(value) && hasExport(ast, value)) {
                    knownExportedIdents.add(value.name)
                  } else {
                    trackedNodesToSplitByType[meta.routeIdent] = {
                      node: value,
                      meta,
                    }
                  }
                })

                // Remove all of the options
                options.properties = []
              }
            }

            babelHandleVirtual(resolveRouteOptions(path))
          },
        })

        for (const name of knownExportedIdents) {
          removeExports(ast, t.identifier(name))
        }

        // Start the transformation to only exported the intended split nodes
        intendedSplitNodes.forEach((SPLIT_TYPE) => {
          const splitKey = trackedNodesToSplitByType[SPLIT_TYPE]

          if (!splitKey) {
            return
          }

          let splitNode = splitKey.node
          const splitMeta = { ...splitKey.meta, shouldRemoveNode: true }

          // Track the original identifier name before resolving through bindings,
          // needed for destructured patterns where the binding resolves to the
          // entire VariableDeclarator (ObjectPattern) rather than the specific binding
          let originalIdentName: string | undefined
          if (t.isIdentifier(splitNode)) {
            originalIdentName = splitNode.name
          }

          while (t.isIdentifier(splitNode)) {
            const binding = programPath.scope.getBinding(splitNode.name)
            splitNode = binding?.path.node
          }

          // Add the node to the program
          if (splitNode) {
            for (const plugin of opts.compilerPlugins ?? []) {
              plugin.onVirtualRouteSplitNode?.({
                programPath,
                splitNode,
                splitNodeMeta: splitMeta,
              })
            }

            if (t.isFunctionDeclaration(splitNode)) {
              // an anonymous function declaration should only happen for `export default function() {...}`
              // so we should never get here
              if (!splitNode.id) {
                throw new Error(
                  `Function declaration for "${SPLIT_TYPE}" must have an identifier.`,
                )
              }

              splitMeta.shouldRemoveNode = false
              splitMeta.localExporterIdent = splitNode.id.name
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
              if (t.isIdentifier(splitNode.id)) {
                splitMeta.localExporterIdent = splitNode.id.name
                splitMeta.shouldRemoveNode = false
              } else if (t.isObjectPattern(splitNode.id)) {
                // Destructured binding like `const { component: MyComp } = createBits()`
                // Use the original identifier name that was tracked before resolving
                if (originalIdentName) {
                  splitMeta.localExporterIdent = originalIdentName
                }
                splitMeta.shouldRemoveNode = false
              } else {
                throw new Error(
                  `Unexpected splitNode type ☝️: ${splitNode.type}`,
                )
              }
            } else if (t.isExpression(splitNode)) {
              // a function, or any other expression the reference file
              // split (`memo(Posts)`, `api.list`, `a ?? b`, `cond ? A : B`)
              programPath.pushContainer(
                'body',
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier(splitMeta.localExporterIdent),
                    splitNode,
                  ),
                ]),
              )
            } else {
              console.info('Unexpected splitNode type:', splitNode)
              throw new Error(`Unexpected splitNode type ☝️: ${splitNode.type}`)
            }
          }

          if (splitMeta.shouldRemoveNode) {
            // If the splitNode exists at the top of the program
            // then we need to remove that copy
            programPath.node.body = programPath.node.body.filter((node) => {
              return node !== splitNode
            })
          }

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
                const specifiers = path.node.declaration.declarations.flatMap(
                  (decl) => {
                    if (t.isIdentifier(decl.id)) {
                      return [
                        t.importSpecifier(
                          t.identifier(decl.id.name),
                          t.identifier(decl.id.name),
                        ),
                      ]
                    }

                    if (t.isObjectPattern(decl.id)) {
                      return collectIdentifiersFromPattern(decl.id).map(
                        (name) =>
                          t.importSpecifier(
                            t.identifier(name),
                            t.identifier(name),
                          ),
                      )
                    }

                    if (t.isArrayPattern(decl.id)) {
                      return collectIdentifiersFromPattern(decl.id).map(
                        (name) =>
                          t.importSpecifier(
                            t.identifier(name),
                            t.identifier(name),
                          ),
                      )
                    }

                    return []
                  },
                )

                if (specifiers.length === 0) {
                  path.remove()
                  return
                }

                const importDecl = t.importDeclaration(
                  specifiers,
                  t.stringLiteral(
                    removeSplitSearchParamFromFilename(opts.filename),
                  ),
                )

                path.replaceWith(importDecl)

                // Track the imported identifier paths so deadCodeElimination can remove them if unused
                // We need to traverse the newly created import to get the identifier paths
                path.traverse({
                  Identifier(identPath) {
                    // Only track the local binding identifiers (the imported names)
                    if (
                      identPath.parentPath.isImportSpecifier() &&
                      identPath.key === 'local'
                    ) {
                      refIdents.add(identPath)
                    }
                  },
                })
              }
            }
          },
        })

        // Add shared bindings import, registering specifiers in refIdents
        // so DCE can remove unused ones (same pattern as import replacements above).
        if (opts.sharedBindings && opts.sharedBindings.size > 0) {
          const sharedImportSpecifiers = [...opts.sharedBindings].map((name) =>
            t.importSpecifier(t.identifier(name), t.identifier(name)),
          )
          const sharedModuleUrl = addSharedSearchParamToFilename(
            removeSplitSearchParamFromFilename(opts.filename),
          )
          const [sharedImportPath] = programPath.unshiftContainer(
            'body',
            t.importDeclaration(
              sharedImportSpecifiers,
              t.stringLiteral(sharedModuleUrl),
            ),
          )

          sharedImportPath.traverse({
            Identifier(identPath) {
              if (
                identPath.parentPath.isImportSpecifier() &&
                identPath.key === 'local'
              ) {
                refIdents.add(identPath)
              }
            },
          })
        }
      },
    },
  })

  deadCodeElimination(ast, refIdents)
  stripUnreferencedTopLevelExpressionStatements(ast)

  // If the body is empty after DCE, strip directive prologues too.
  // A file containing only `'use client'` with no real code is useless.
  if (ast.program.body.length === 0) {
    ast.program.directives = []
  }

  const result = generateFromAst(ast, {
    sourceMaps: true,
    sourceFileName: opts.filename,
    filename: opts.filename,
  })

  // @babel/generator does not populate sourcesContent — see compileCodeSplitReferenceRoute.
  if (result.map) {
    result.map.sourcesContent = [opts.code]
  }

  return result
}

/**
 * Compile the shared virtual module (`?tsr-shared=1`).
 * Keeps only shared binding declarations, their transitive dependencies,
 * and imports they need. Exports all shared bindings.
 */
export function compileCodeSplitSharedRoute(
  opts: ParseAstOptions & {
    sharedBindings: Set<string>
    filename: string
    deleteNodes?: ReadonlySet<string>
  },
): GeneratorResult {
  const ast = parseAst(opts)
  const refIdents = findReferencedIdentifiers(ast)

  // A shared outer options object still contains inline lifecycle objects.
  const deleteNodesTree = buildDeleteNodesTree(opts.deleteNodes)
  if (deleteNodesTree) {
    const route = findRouteOptions(ast)
    if (route) {
      deleteObjectProperties(route.routeOptions, deleteNodesTree)
    }
  }

  const declMap = buildDeclarationMap(ast)

  // Collect all names that need to stay: shared bindings + their transitive deps
  const localBindings = new Set<string>()
  for (const node of ast.program.body) {
    collectLocalBindingsFromStatement(node, localBindings)
  }

  // Route must never be extracted into the shared module.
  // Excluding it from the dep graph prevents expandTransitively from
  // pulling it in as a transitive dependency of a shared binding.
  localBindings.delete('Route')

  const depGraph = buildDependencyGraph(declMap, localBindings)

  // Start with shared bindings and expand transitively
  const keepBindings = new Set(opts.sharedBindings)
  keepBindings.delete('Route')
  expandTransitively(keepBindings, depGraph)

  retainModuleLevelDeclarations(ast, keepBindings)
  unwrapExportedDeclarations(ast)

  // Export all shared bindings (sorted for deterministic output)
  const exportNames = [...opts.sharedBindings].sort((a, b) =>
    a.localeCompare(b),
  )
  const exportSpecifiers = exportNames.map((name) =>
    t.exportSpecifier(t.identifier(name), t.identifier(name)),
  )
  if (exportSpecifiers.length > 0) {
    const exportDecl = t.exportNamedDeclaration(null, exportSpecifiers)
    ast.program.body.push(exportDecl)

    // Register export specifier locals in refIdents so DCE doesn't treat
    // the exported bindings as unreferenced.
    babel.traverse(ast, {
      Program(programPath) {
        const bodyPaths = programPath.get('body')
        const last = bodyPaths[bodyPaths.length - 1]
        if (last && last.isExportNamedDeclaration()) {
          last.traverse({
            Identifier(identPath) {
              if (
                identPath.parentPath.isExportSpecifier() &&
                identPath.key === 'local'
              ) {
                refIdents.add(identPath)
              }
            },
          })
        }
        programPath.stop()
      },
    })
  }

  deadCodeElimination(ast, refIdents)

  // If the body is empty after DCE, strip directive prologues too.
  if (ast.program.body.length === 0) {
    ast.program.directives = []
  }

  const result = generateFromAst(ast, {
    sourceMaps: true,
    sourceFileName: opts.filename,
    filename: opts.filename,
  })

  // @babel/generator does not populate sourcesContent — see compileCodeSplitReferenceRoute.
  if (result.map) {
    result.map.sourcesContent = [opts.code]
  }

  return result
}

/**
 * This function should read get the options from by searching for the key `codeSplitGroupings`
 * on createFileRoute and return it's values if it exists, else return undefined
 */
export function detectCodeSplitGroupingsFromRoute(opts: ParseAstOptions): {
  groupings: CodeSplitGroupings | undefined
} {
  const ast = parseAst(opts)

  let codeSplitGroupings: CodeSplitGroupings | undefined = undefined

  babel.traverse(ast, {
    Program: {
      enter(programPath) {
        programPath.traverse({
          CallExpression(path) {
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

            function babelHandleSplittingGroups(
              routeOptions: t.Node | undefined,
            ) {
              if (t.isObjectExpression(routeOptions)) {
                routeOptions.properties.forEach((prop) => {
                  if (t.isObjectProperty(prop)) {
                    const key = getObjectPropertyKeyName(prop)
                    if (key === 'codeSplitGroupings') {
                      const value = prop.value

                      if (t.isArrayExpression(value)) {
                        codeSplitGroupings = value.elements.map((group) => {
                          if (t.isArrayExpression(group)) {
                            return group.elements.map((node) => {
                              if (!t.isStringLiteral(node)) {
                                throw new Error(
                                  'You must provide a string literal for the codeSplitGroupings',
                                )
                              }

                              return node.value
                            }) as Array<SplitRouteIdentNodes>
                          }

                          throw new Error(
                            'You must provide arrays with codeSplitGroupings options.',
                          )
                        })
                      } else {
                        throw new Error(
                          'You must provide an array of arrays for the codeSplitGroupings.',
                        )
                      }
                    }
                  }
                })
              }
            }

            // Extracting the codeSplitGroupings
            babelHandleSplittingGroups(resolveRouteOptions(path))
          },
        })
      },
    },
  })

  return { groupings: codeSplitGroupings }
}

function createNotExportableMessage(
  filename: string,
  idents: Set<string>,
): string {
  const list = Array.from(idents).map((d) => `- ${d}`)

  const message = [
    `[tanstack-router] These exports from "${filename}" will not be code-split and will increase your bundle size:`,
    ...list,
    'For the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.',
  ].join('\n')

  return message
}

/**
 * The value of a route options argument: the node itself, or the object
 * literal a same-file variable holds. Transparent TypeScript wrappers
 * (`{ ... } satisfies T`, `{ ... } as T`) are seen through on either side,
 * so the options are visited as if written bare.
 */
function resolveIdentifier(
  path: babel.NodePath,
  node: t.Node | null | undefined,
): t.Node | undefined {
  const value = node ? unwrapTransparentExpression(node) : undefined

  if (!t.isIdentifier(value)) {
    return value
  }

  const declarator = path.scope.getBinding(value.name)?.path.node
  const init =
    t.isVariableDeclarator(declarator) && declarator.init
      ? unwrapTransparentExpression(declarator.init)
      : undefined

  return t.isObjectExpression(init) ? init : undefined
}

/**
 * Removes the declaration of `name`: the property of a destructuring
 * pattern (and the declarator once the pattern is empty), the variable or
 * function, or the import specifier (and the import once it has none left).
 */
function removeBinding(binding: Binding, name: string) {
  const declarator = binding.path.node

  if (t.isVariableDeclarator(declarator) && t.isObjectPattern(declarator.id)) {
    const objectPattern = declarator.id
    objectPattern.properties = objectPattern.properties.filter((prop) => {
      if (!t.isObjectProperty(prop)) {
        return true
      }

      if (t.isIdentifier(prop.value) && prop.value.name === name) {
        return false
      }

      if (
        t.isAssignmentPattern(prop.value) &&
        t.isIdentifier(prop.value.left) &&
        prop.value.left.name === name
      ) {
        return false
      }

      return true
    })

    if (objectPattern.properties.length === 0) {
      binding.path.remove()
    }

    return
  }

  const declaration = binding.path.parentPath
  binding.path.remove()
  if (
    declaration?.isImportDeclaration() &&
    declaration.node.specifiers.length === 0
  ) {
    declaration.remove()
  }
}

/**
 * Whether `specifier` of a local `export { a, b as c }` (no source) exports
 * the binding `name`.
 */
function exportsBinding(
  specifier: t.ExportNamedDeclaration['specifiers'][number],
  name: string,
): boolean {
  return t.isExportSpecifier(specifier) && specifier.local.name === name
}

/**
 * Whether the module exports the binding `node` names: `export const`,
 * `export function`, `export { x }` or `export default`. Exports are
 * top-level statements, so the program body is all there is to read.
 */
function hasExport(ast: t.File, node: t.Identifier): boolean {
  return ast.program.body.some((statement) => {
    if (t.isExportNamedDeclaration(statement)) {
      const declaration = statement.declaration

      if (t.isVariableDeclaration(declaration)) {
        // also destructured: `export const { a, b } = fn()`
        return declaration.declarations.some((declarator) =>
          collectIdentifiersFromPattern(declarator.id).includes(node.name),
        )
      }

      if (t.isFunctionDeclaration(declaration)) {
        return declaration.id?.name === node.name
      }

      // declared elsewhere and exported as `export { loaderFn }`; a
      // re-export with a source names another module's binding
      return (
        !statement.source &&
        statement.specifiers.some((specifier) =>
          exportsBinding(specifier, node.name),
        )
      )
    }

    if (t.isExportDefaultDeclaration(statement)) {
      const declaration = statement.declaration

      return (
        (t.isIdentifier(declaration) && declaration.name === node.name) ||
        (t.isFunctionDeclaration(declaration) &&
          declaration.id?.name === node.name)
      )
    }

    return false
  })
}

function removeExports(ast: t.File, node: t.Identifier): boolean {
  let removed = false

  // The checks use sequential if/else if statements since it
  // directly mutates the AST and as such doing normal checks
  // (using only if statements) could lead to a situation where
  // `path.node` is null since it has been already removed from
  // the program tree but typescript doesn't know that.
  babel.traverse(ast, {
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        if (t.isVariableDeclaration(path.node.declaration)) {
          // declared as `const loaderFn = () => {}`
          path.node.declaration.declarations.forEach((decl) => {
            if (t.isVariableDeclarator(decl)) {
              if (t.isIdentifier(decl.id)) {
                if (decl.id.name === node.name) {
                  path.remove()
                  removed = true
                }
              } else if (
                t.isObjectPattern(decl.id) ||
                t.isArrayPattern(decl.id)
              ) {
                // Handle destructured exports like `export const { a, b } = fn()`
                const names = collectIdentifiersFromPattern(decl.id)
                if (names.includes(node.name)) {
                  path.remove()
                  removed = true
                }
              }
            }
          })
        } else if (t.isFunctionDeclaration(path.node.declaration)) {
          // declared as `export const loaderFn = () => {}`
          if (t.isIdentifier(path.node.declaration.id)) {
            if (path.node.declaration.id.name === node.name) {
              path.remove()
              removed = true
            }
          }
        }
      } else if (!path.node.source) {
        // declared elsewhere and exported as `export { loaderFn }`: the
        // specifier goes, and the statement once it has none left
        const remaining = path.node.specifiers.filter(
          (specifier) => !exportsBinding(specifier, node.name),
        )

        if (remaining.length < path.node.specifiers.length) {
          if (remaining.length === 0) {
            path.remove()
          } else {
            path.node.specifiers = remaining
          }
          removed = true
        }
      }
    },
    ExportDefaultDeclaration(path) {
      // declared as `export default loaderFn`
      if (t.isIdentifier(path.node.declaration)) {
        if (path.node.declaration.name === node.name) {
          path.remove()
          removed = true
        }
      } else if (t.isFunctionDeclaration(path.node.declaration)) {
        // declared as `export default function loaderFn() {}`
        if (t.isIdentifier(path.node.declaration.id)) {
          if (path.node.declaration.id.name === node.name) {
            path.remove()
            removed = true
          }
        }
      }
    },
  })

  return removed
}
