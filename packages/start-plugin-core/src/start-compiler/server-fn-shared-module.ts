import * as t from '@babel/types'
import {
  buildDeclarationMap,
  buildDependencyGraph,
  collectIdentifiersFromNode,
  collectIdentifiersFromPattern,
  collectLocalBindingsFromStatement,
  expandTransitively,
} from '@tanstack/router-utils'
import path from 'pathe'
import type babel from '@babel/core'

/**
 * On the server, other code imports a module's SSR caller while the
 * server-fn router runs its handlers from the provider module
 * (`?tss-serverfn-split`). Both are compiled from the same source, so every
 * module-level binding they both use would exist twice: two classes, two
 * caches, two counters. Like the route splitter's `?tsr-shared=1` module,
 * those bindings move into one `?tss-serverfn-shared` module that the
 * provider and the module's other variants import.
 */
export const TSS_SERVERFN_SHARED_PARAM = 'tss-serverfn-shared'

export interface ServerFnDeclaration {
  /** The variable the server function is assigned to. */
  name: string
  /** The `.handler()` call; only the provider keeps its argument. */
  handlerCall: t.CallExpression
}

export function isServerFnSharedModuleId(id: string) {
  return new URLSearchParams(id.split('?')[1] ?? '').has(
    TSS_SERVERFN_SHARED_PARAM,
  )
}

/** The import specifier of a module's shared module, relative to the module. */
export function getServerFnSharedModuleSpecifier(id: string) {
  const [filename] = id.split('?') as [string]
  return `./${path.basename(filename)}?${TSS_SERVERFN_SHARED_PARAM}`
}

function getDeclaration(statement: t.Statement | t.ModuleDeclaration) {
  if (t.isExportNamedDeclaration(statement)) {
    return statement.declaration ?? null
  }
  if (t.isExportDefaultDeclaration(statement)) {
    const declaration = statement.declaration
    return (t.isFunctionDeclaration(declaration) ||
      t.isClassDeclaration(declaration)) &&
      declaration.id
      ? declaration
      : null
  }
  return statement
}

function isTypeOnlyStatement(statement: t.Statement | t.ModuleDeclaration) {
  if (
    (t.isExportNamedDeclaration(statement) ||
      t.isExportAllDeclaration(statement)) &&
    statement.exportKind === 'type'
  ) {
    return true
  }
  const declaration = t.isExportNamedDeclaration(statement)
    ? statement.declaration
    : statement
  return (
    t.isTSTypeAliasDeclaration(declaration) ||
    t.isTSInterfaceDeclaration(declaration) ||
    t.isTSDeclareFunction(declaration) ||
    (t.isVariableDeclaration(declaration) && declaration.declare === true) ||
    (t.isClassDeclaration(declaration) && declaration.declare === true)
  )
}

/**
 * Statements that run no code of their own when the module is evaluated:
 * export lists and default-exported names or functions.
 */
function isInertStatement(statement: t.Statement | t.ModuleDeclaration) {
  return (
    (t.isExportNamedDeclaration(statement) && !statement.declaration) ||
    (t.isExportDefaultDeclaration(statement) &&
      (t.isIdentifier(statement.declaration) ||
        t.isFunctionDeclaration(statement.declaration)))
  )
}

/**
 * Names that runtime TypeScript declarations bind: enums, namespaces and
 * `import x = require()`. The shared module does not take them over.
 */
function collectTypeScriptRuntimeBindings(
  statement: t.Statement | t.ModuleDeclaration,
  bindings: Set<string>,
) {
  const declaration = t.isExportNamedDeclaration(statement)
    ? statement.declaration
    : statement
  if (
    (t.isTSEnumDeclaration(declaration) ||
      t.isTSImportEqualsDeclaration(declaration) ||
      (t.isTSModuleDeclaration(declaration) && !declaration.declare)) &&
    t.isIdentifier(declaration.id)
  ) {
    bindings.add(declaration.id.name)
  }
}

/**
 * The names of the module-level declaration that contains `nodePath`, or
 * null when it sits in a statement that declares no binding.
 */
function getEnclosingDeclarationNames(nodePath: babel.NodePath) {
  const statement = nodePath.find((p) => !!p.parentPath?.isProgram())
  if (!statement) return null
  const declaration = getDeclaration(statement.node as t.Statement)
  if (
    t.isFunctionDeclaration(declaration) ||
    t.isClassDeclaration(declaration)
  ) {
    return declaration.id ? [declaration.id.name] : null
  }
  if (t.isVariableDeclaration(declaration)) {
    const declarator = nodePath.find(
      (p) => p.isVariableDeclarator() && p.parentPath.node === declaration,
    )
    return declarator
      ? collectIdentifiersFromPattern(
          (declarator.node as t.VariableDeclarator).id,
        )
      : null
  }
  return null
}

/**
 * The module-level bindings that server function handlers share with the rest
 * of the module, in source order. A binding is shared when the provider and
 * the module's other code both use it. The set is closed over dependencies,
 * keeps destructured declarations whole and keeps every reassignment next to
 * its binding: a declaration that writes a shared binding is shared too, so a
 * handler that writes one moves its server function into the shared module.
 * Bindings written or read by module-level statements stay where they are,
 * since those statements run in the module itself.
 */
export function computeServerFnSharedBindings(opts: {
  ast: t.File
  programPath: babel.NodePath<t.Program>
  serverFns: Array<ServerFnDeclaration>
}): Array<string> {
  const { ast, programPath, serverFns } = opts
  const localBindings = new Set<string>()
  const typeScriptBindings = new Set<string>()
  for (const statement of ast.program.body) {
    collectLocalBindingsFromStatement(statement, localBindings)
    collectTypeScriptRuntimeBindings(statement, typeScriptBindings)
  }
  if (localBindings.size <= serverFns.length) return []
  // Track uses of them, so what reads them stays where it is as well.
  for (const name of typeScriptBindings) localBindings.add(name)

  const declarations = buildDeclarationMap(ast)
  const graph = buildDependencyGraph(declarations, localBindings)
  // A declaration that writes a binding uses it as well, although Babel does
  // not count an assignment target as a reference.
  for (const name of localBindings) {
    const violations =
      programPath.scope.getBinding(name)?.constantViolations ?? []
    for (const violation of violations) {
      for (const writer of getEnclosingDeclarationNames(violation) ?? []) {
        if (writer !== name) graph.get(writer)?.add(name)
      }
    }
  }

  // The module's other code keeps each server function's builder chain but
  // replaces the handler, so the handler's dependencies are not its own.
  const restGraph = new Map(graph)
  for (const { name, handlerCall } of serverFns) {
    const declaration = declarations.get(name)
    if (!declaration) continue
    const handlerArgs = handlerCall.arguments
    handlerCall.arguments = []
    const dependencies = new Set<string>()
    for (const id of collectIdentifiersFromNode(declaration)) {
      if (id !== name && localBindings.has(id)) dependencies.add(id)
    }
    handlerCall.arguments = handlerArgs
    restGraph.set(name, dependencies)
  }

  // Never move the route singleton, runtime TypeScript declarations or
  // bindings statements use.
  const unshareable = new Set<string>(['Route', ...typeScriptBindings])
  const restUses = new Set<string>()
  for (const statement of ast.program.body) {
    if (
      t.isImportDeclaration(statement) ||
      isTypeOnlyStatement(statement) ||
      ((t.isExportNamedDeclaration(statement) ||
        t.isExportAllDeclaration(statement)) &&
        statement.source)
    ) {
      continue
    }
    const declaration = getDeclaration(statement)
    if (declaration && declaration !== statement) {
      collectLocalBindingsFromStatement(statement, restUses)
      continue
    }
    if (
      t.isVariableDeclaration(declaration) ||
      t.isFunctionDeclaration(declaration) ||
      t.isClassDeclaration(declaration)
    ) {
      continue
    }
    for (const id of collectIdentifiersFromNode(statement)) {
      if (!localBindings.has(id)) continue
      restUses.add(id)
      if (!isInertStatement(statement)) unshareable.add(id)
    }
  }
  expandTransitively(restUses, restGraph)

  const serverFnNames = new Set(serverFns.map((fn) => fn.name))
  const providerUses = new Set(serverFnNames)
  expandTransitively(providerUses, graph)

  // Names declared together by one destructuring must move together.
  const declaratorNames = new Map<string, Array<string>>()
  for (const statement of ast.program.body) {
    const declaration = getDeclaration(statement)
    if (!t.isVariableDeclaration(declaration)) continue
    for (const declarator of declaration.declarations) {
      const names = collectIdentifiersFromPattern(declarator.id)
      for (const name of names) declaratorNames.set(name, names)
    }
  }
  const withDeclaratorNames = (names: Iterable<string>) =>
    [...names].flatMap((name) => declaratorNames.get(name) ?? [name])

  // Shared: declarations both sides evaluate, including a destructuring
  // whose names the two sides use separately.
  const shared = new Set<string>()
  for (const name of restUses) {
    const declared = withDeclaratorNames([name])
    if (
      declared.some((other) => providerUses.has(other)) &&
      !declared.some((other) => serverFnNames.has(other))
    ) {
      for (const other of declared) shared.add(other)
    }
  }
  if (shared.size === 0) return []

  const dependsOnUnshareable = (name: string) => {
    const dependencies = new Set(withDeclaratorNames([name]))
    expandTransitively(dependencies, graph)
    return withDeclaratorNames(dependencies).some((dependency) =>
      unshareable.has(dependency),
    )
  }

  for (;;) {
    let changed = false
    const closure = new Set(withDeclaratorNames(shared))
    expandTransitively(closure, graph)
    for (const name of withDeclaratorNames(closure)) {
      if (!shared.has(name)) {
        shared.add(name)
        changed = true
      }
    }
    for (const name of [...shared]) {
      if (dependsOnUnshareable(name)) {
        for (const declared of withDeclaratorNames([name])) {
          shared.delete(declared)
          unshareable.add(declared)
        }
        changed = true
      }
    }
    for (const name of [...shared]) {
      const violations =
        programPath.scope.getBinding(name)?.constantViolations ?? []
      for (const violation of violations) {
        const writers = getEnclosingDeclarationNames(violation)
        if (!writers || writers.some(dependsOnUnshareable)) {
          if (shared.has(name)) {
            for (const declared of withDeclaratorNames([name])) {
              shared.delete(declared)
              unshareable.add(declared)
            }
            changed = true
          }
          break
        }
        for (const writer of withDeclaratorNames(writers)) {
          if (!shared.has(writer)) {
            shared.add(writer)
            changed = true
          }
        }
      }
    }
    if (!changed) break
  }

  const ordered: Array<string> = []
  for (const statement of ast.program.body) {
    const names = new Set<string>()
    collectLocalBindingsFromStatement(statement, names)
    for (const name of names) {
      if (shared.has(name)) ordered.push(name)
    }
  }
  return ordered
}

function getDeclarationPath(statementPath: babel.NodePath<t.Statement>) {
  if (
    statementPath.isExportNamedDeclaration() ||
    statementPath.isExportDefaultDeclaration()
  ) {
    const declarationPath = statementPath.get(
      'declaration',
    ) as babel.NodePath<t.Node>
    return getDeclaration(statementPath.node) ? declarationPath : null
  }
  return statementPath
}

type RemovedDeclaration = { name: string; exportedAs?: string | undefined }

/**
 * Removes the declarations of `names`, returning what each removed name was
 * exported as.
 */
function removeDeclarations(
  programPath: babel.NodePath<t.Program>,
  names: Set<string>,
  keep: boolean,
): Array<RemovedDeclaration> {
  const removed: Array<RemovedDeclaration> = []
  for (const statementPath of programPath.get('body')) {
    if (statementPath.isImportDeclaration()) continue
    const declarationPath = getDeclarationPath(statementPath)
    const exportedAs = statementPath.isExportDefaultDeclaration()
      ? 'default'
      : statementPath.isExportNamedDeclaration()
        ? 'named'
        : undefined

    if (declarationPath?.isVariableDeclaration()) {
      for (const declaratorPath of declarationPath.get('declarations')) {
        const declared = collectIdentifiersFromPattern(declaratorPath.node.id)
        if (declared.some((name) => names.has(name)) === keep) continue
        for (const name of declared) {
          removed.push({ name, exportedAs: exportedAs && name })
        }
        declaratorPath.remove()
      }
      if (
        !statementPath.removed &&
        declarationPath.node.declarations.length === 0
      ) {
        statementPath.remove()
      }
      continue
    }

    if (
      (declarationPath?.isFunctionDeclaration() ||
        declarationPath?.isClassDeclaration()) &&
      declarationPath.node.id
    ) {
      const name = declarationPath.node.id.name
      if (names.has(name) === keep) continue
      removed.push({
        name,
        exportedAs: exportedAs === 'default' ? 'default' : exportedAs && name,
      })
      statementPath.remove()
      continue
    }

    if (keep) statementPath.remove()
  }
  return removed
}

/**
 * Turns a module into its `?tss-serverfn-shared` module: its imports and the
 * shared declarations, each exported by name. Kept declarations stay in their
 * statements so the compiler's paths into them remain valid.
 */
export function retainServerFnSharedDeclarations(
  programPath: babel.NodePath<t.Program>,
  shared: Array<string>,
) {
  removeDeclarations(programPath, new Set(shared), true)
  const exportedByName = new Set<string>()
  for (const statement of programPath.node.body) {
    if (t.isExportNamedDeclaration(statement)) {
      collectLocalBindingsFromStatement(statement, exportedByName)
    }
  }
  const unexported = shared.filter((name) => !exportedByName.has(name))
  if (unexported.length > 0) {
    programPath.pushContainer(
      'body',
      t.exportNamedDeclaration(
        null,
        unexported.map((name) =>
          t.exportSpecifier(t.identifier(name), t.identifier(name)),
        ),
      ),
    )
  }
}

/**
 * Replaces the shared declarations of a module with imports from its
 * `?tss-serverfn-shared` module, keeping their exports.
 */
export function importServerFnSharedDeclarations(
  programPath: babel.NodePath<t.Program>,
  shared: Array<string>,
  source: string,
) {
  const removed = removeDeclarations(programPath, new Set(shared), false)
  if (removed.length === 0) return

  programPath.unshiftContainer(
    'body',
    t.importDeclaration(
      removed.map(({ name }) =>
        t.importSpecifier(t.identifier(name), t.identifier(name)),
      ),
      t.stringLiteral(source),
    ),
  )

  const exported = removed.filter(({ exportedAs }) => exportedAs)
  if (exported.length > 0) {
    programPath.pushContainer(
      'body',
      t.exportNamedDeclaration(
        null,
        exported.map(({ name, exportedAs }) =>
          t.exportSpecifier(t.identifier(name), t.identifier(exportedAs!)),
        ),
      ),
    )
  }
}

/**
 * Drops the bindings a module imports from its shared module but no longer
 * uses once compiled, e.g. those only the replaced handlers read.
 */
export function pruneServerFnSharedImports(
  programPath: babel.NodePath<t.Program>,
  source: string,
) {
  programPath.scope.crawl()
  for (const statementPath of programPath.get('body')) {
    if (
      !statementPath.isImportDeclaration() ||
      statementPath.node.source.value !== source
    ) {
      continue
    }
    for (const specifierPath of statementPath.get('specifiers')) {
      const binding = programPath.scope.getBinding(
        specifierPath.node.local.name,
      )
      if (!binding?.referenced) specifierPath.remove()
    }
    if (statementPath.node.specifiers.length === 0) statementPath.remove()
  }
}
