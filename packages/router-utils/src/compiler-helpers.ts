import * as t from '@babel/types'

/**
 * Recursively walk an AST node and collect referenced identifier-like names.
 * This avoids Babel path/scope allocation for module-level dependency scans.
 */
export function collectIdentifiersFromNode(node: t.Node): Set<string> {
  const ids = new Set<string>()

  ;(function walk(
    current: t.Node | null | undefined,
    parent?: t.Node,
    grandparent?: t.Node,
    parentKey?: string,
  ) {
    if (!current) return

    if (t.isIdentifier(current)) {
      if (!parent || t.isReferenced(current, parent, grandparent)) {
        ids.add(current.name)
      }
      return
    }

    if (t.isJSXIdentifier(current)) {
      if (parent && t.isJSXAttribute(parent) && parentKey === 'name') {
        return
      }

      if (
        parent &&
        t.isJSXMemberExpression(parent) &&
        parentKey === 'property'
      ) {
        return
      }

      const first = current.name[0]
      if (first && first === first.toLowerCase()) {
        return
      }

      ids.add(current.name)
      return
    }

    for (const key of t.VISITOR_KEYS[current.type] ?? []) {
      const child = (current as any)[key]
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item.type === 'string') {
            walk(item, current, parent, key)
          }
        }
      } else if (child && typeof child.type === 'string') {
        walk(child, current, parent, key)
      }
    }
  })(node)

  return ids
}

export function collectIdentifiersFromPattern(
  node: t.LVal | t.Node | null | undefined,
): Array<string> {
  if (!node) {
    return []
  }

  if (t.isIdentifier(node)) {
    return [node.name]
  }

  if (t.isAssignmentPattern(node)) {
    return collectIdentifiersFromPattern(node.left)
  }

  if (t.isRestElement(node)) {
    return collectIdentifiersFromPattern(node.argument)
  }

  if (t.isObjectPattern(node)) {
    return node.properties.flatMap((prop) => {
      if (t.isObjectProperty(prop)) {
        return collectIdentifiersFromPattern(prop.value as t.LVal)
      }
      if (t.isRestElement(prop)) {
        return collectIdentifiersFromPattern(prop.argument)
      }
      return []
    })
  }

  if (t.isArrayPattern(node)) {
    return node.elements.flatMap((element) =>
      collectIdentifiersFromPattern(element),
    )
  }

  return []
}

export function collectLocalBindingsFromStatement(
  node: t.Statement | t.ModuleDeclaration,
  bindings: Set<string>,
) {
  const declaration =
    t.isExportNamedDeclaration(node) && node.declaration
      ? node.declaration
      : node

  if (t.isVariableDeclaration(declaration)) {
    for (const declarator of declaration.declarations) {
      for (const name of collectIdentifiersFromPattern(declarator.id)) {
        bindings.add(name)
      }
    }
  } else if (t.isFunctionDeclaration(declaration) && declaration.id) {
    bindings.add(declaration.id.name)
  } else if (t.isClassDeclaration(declaration) && declaration.id) {
    bindings.add(declaration.id.name)
  }
}

export function buildDeclarationMap(ast: t.File): Map<string, t.Node> {
  const map = new Map<string, t.Node>()

  for (const statement of ast.program.body) {
    const declaration =
      t.isExportNamedDeclaration(statement) && statement.declaration
        ? statement.declaration
        : statement

    if (t.isVariableDeclaration(declaration)) {
      for (const declarator of declaration.declarations) {
        for (const name of collectIdentifiersFromPattern(declarator.id)) {
          map.set(name, declarator)
        }
      }
    } else if (t.isFunctionDeclaration(declaration) && declaration.id) {
      map.set(declaration.id.name, declaration)
    } else if (t.isClassDeclaration(declaration) && declaration.id) {
      map.set(declaration.id.name, declaration)
    }
  }

  return map
}

export function buildDependencyGraph(
  declarationMap: Map<string, t.Node>,
  localBindings: Set<string>,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>()

  for (const [name, declarationNode] of declarationMap) {
    if (!localBindings.has(name)) continue

    const dependencies = new Set<string>()
    for (const id of collectIdentifiersFromNode(declarationNode)) {
      if (id !== name && localBindings.has(id)) {
        dependencies.add(id)
      }
    }
    graph.set(name, dependencies)
  }

  return graph
}

export function collectModuleLevelRefsFromNode(
  node: t.Node,
  localModuleLevelBindings: Set<string>,
): Set<string> {
  const refs = new Set<string>()

  for (const name of collectIdentifiersFromNode(node)) {
    if (localModuleLevelBindings.has(name)) {
      refs.add(name)
    }
  }

  return refs
}

export function expandTransitively(
  bindings: Set<string>,
  dependencyGraph: Map<string, Set<string>>,
) {
  const queue = [...bindings]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const name = queue.pop()!
    if (visited.has(name)) continue
    visited.add(name)

    const dependencies = dependencyGraph.get(name)
    if (!dependencies) continue

    for (const dependency of dependencies) {
      if (!bindings.has(dependency)) {
        bindings.add(dependency)
        queue.push(dependency)
      }
    }
  }
}

export function expandSharedDestructuredDeclarators(
  ast: t.File,
  refsByGroup: Map<string, Set<number>>,
  sharedBindings: Set<string>,
) {
  for (const statement of ast.program.body) {
    const declaration =
      t.isExportNamedDeclaration(statement) && statement.declaration
        ? statement.declaration
        : statement

    if (!t.isVariableDeclaration(declaration)) continue

    for (const declarator of declaration.declarations) {
      if (
        !t.isObjectPattern(declarator.id) &&
        !t.isArrayPattern(declarator.id)
      ) {
        continue
      }

      const names = collectIdentifiersFromPattern(declarator.id)
      const usedGroups = new Set<number>()

      for (const name of names) {
        const groups = refsByGroup.get(name)
        if (!groups) continue
        for (const group of groups) {
          usedGroups.add(group)
        }
      }

      if (usedGroups.size >= 2) {
        for (const name of names) {
          sharedBindings.add(name)
        }
      }
    }
  }
}

export function expandDestructuredDeclarations(
  ast: t.File,
  bindings: Set<string>,
) {
  for (const statement of ast.program.body) {
    const declaration =
      t.isExportNamedDeclaration(statement) && statement.declaration
        ? statement.declaration
        : statement

    if (!t.isVariableDeclaration(declaration)) continue

    for (const declarator of declaration.declarations) {
      if (
        !t.isObjectPattern(declarator.id) &&
        !t.isArrayPattern(declarator.id)
      ) {
        continue
      }

      const names = collectIdentifiersFromPattern(declarator.id)
      if (names.some((name) => bindings.has(name))) {
        for (const name of names) {
          bindings.add(name)
        }
      }
    }
  }
}

export function removeBindingsTransitivelyDependingOn(
  bindings: Set<string>,
  dependencyGraph: Map<string, Set<string>>,
  roots: Iterable<string>,
) {
  const reverseGraph = new Map<string, Set<string>>()

  for (const [name, dependencies] of dependencyGraph) {
    for (const dependency of dependencies) {
      let parents = reverseGraph.get(dependency)
      if (!parents) {
        parents = new Set()
        reverseGraph.set(dependency, parents)
      }
      parents.add(name)
    }
  }

  const visited = new Set<string>()
  const queue = [...roots]

  while (queue.length > 0) {
    const current = queue.pop()!
    if (visited.has(current)) continue
    visited.add(current)

    const parents = reverseGraph.get(current)
    if (!parents) continue

    for (const parent of parents) {
      if (!visited.has(parent)) {
        queue.push(parent)
      }
    }
  }

  for (const name of [...bindings]) {
    if (visited.has(name)) {
      bindings.delete(name)
    }
  }
}

export function removeModuleLevelBindings(
  ast: t.File,
  namesToRemove: Set<string>,
) {
  ast.program.body = ast.program.body.filter((statement) => {
    const declaration =
      t.isExportNamedDeclaration(statement) && statement.declaration
        ? statement.declaration
        : statement

    if (t.isVariableDeclaration(declaration)) {
      declaration.declarations = declaration.declarations.filter(
        (declarator) =>
          !collectIdentifiersFromPattern(declarator.id).some((name) =>
            namesToRemove.has(name),
          ),
      )
      return declaration.declarations.length > 0
    }

    if (t.isFunctionDeclaration(declaration) && declaration.id) {
      return !namesToRemove.has(declaration.id.name)
    }

    if (t.isClassDeclaration(declaration) && declaration.id) {
      return !namesToRemove.has(declaration.id.name)
    }

    if (t.isExportDefaultDeclaration(statement)) {
      const defaultDeclaration = statement.declaration
      if (
        (t.isFunctionDeclaration(defaultDeclaration) ||
          t.isClassDeclaration(defaultDeclaration)) &&
        defaultDeclaration.id
      ) {
        return !namesToRemove.has(defaultDeclaration.id.name)
      }
    }

    return true
  })
}

export function retainModuleLevelDeclarations(
  ast: t.File,
  bindingsToKeep: Set<string>,
) {
  ast.program.body = ast.program.body.filter((statement) => {
    if (t.isImportDeclaration(statement)) return true

    const declaration =
      t.isExportNamedDeclaration(statement) && statement.declaration
        ? statement.declaration
        : statement

    if (t.isVariableDeclaration(declaration)) {
      declaration.declarations = declaration.declarations.filter((declarator) =>
        collectIdentifiersFromPattern(declarator.id).some((name) =>
          bindingsToKeep.has(name),
        ),
      )
      return declaration.declarations.length > 0
    }

    if (t.isFunctionDeclaration(declaration) && declaration.id) {
      return bindingsToKeep.has(declaration.id.name)
    }

    if (t.isClassDeclaration(declaration) && declaration.id) {
      return bindingsToKeep.has(declaration.id.name)
    }

    return false
  })
}

export function unwrapExportedDeclarations(ast: t.File) {
  const body: Array<t.Statement | t.ModuleDeclaration> = []

  for (const statement of ast.program.body) {
    if (t.isExportNamedDeclaration(statement)) {
      if (statement.declaration) {
        body.push(statement.declaration)
      }
      continue
    }

    if (t.isExportDefaultDeclaration(statement)) {
      const declaration = statement.declaration
      if (
        (t.isFunctionDeclaration(declaration) ||
          t.isClassDeclaration(declaration)) &&
        declaration.id
      ) {
        body.push(declaration)
      }
      continue
    }

    if (t.isExportAllDeclaration(statement)) {
      continue
    }

    body.push(statement)
  }

  ast.program.body = body
}

export function stripUnreferencedTopLevelExpressionStatements(ast: t.File) {
  const locallyBound = new Set<string>()

  for (const statement of ast.program.body) {
    collectLocalBindingsFromStatement(statement, locallyBound)
  }

  ast.program.body = ast.program.body.filter((statement) => {
    if (!t.isExpressionStatement(statement)) return true

    for (const name of collectIdentifiersFromNode(statement)) {
      if (locallyBound.has(name)) {
        return true
      }
    }

    return false
  })
}
