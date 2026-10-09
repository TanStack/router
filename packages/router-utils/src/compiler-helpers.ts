import { BindingFlags } from 'yuku-analyzer'
import { b, bindingIdentifiers, is, nameOf, walk } from 'yuku-ast'
import { generatedReferenceOf } from './ast'
import type { Binding, Module, Scope } from 'yuku-analyzer'
import type { Expression, Node, Program } from '@yuku-toolchain/types'

export interface ModuleDeclarationGraph {
  /** The statement of its own scope declaring each binding, if any. */
  declarations: Map<Binding, Node>
  dependencies: Map<Binding, Set<Binding>>
  /** Every removable declaration, including `var` nested in statements. */
  declarationBindings: Map<Node, Set<Binding>>
}

/** Runtime references resolved by Yuku, including JSX and excluding shadowed names. */
export function collectModuleReferences(
  module: Module,
  node: Node,
): Set<Binding> {
  const references = new Set<Binding>()
  module.walk(
    {
      enter(current) {
        const reference = module.referenceOf(current)
        if (
          reference &&
          !reference.inTypePosition &&
          reference.binding?.scope === module.rootScope
        ) {
          references.add(reference.binding)
        }
      },
    },
    node,
  )
  return references
}

/** The node that declares an identifier and goes when its bindings do. */
function declarationOf(module: Module, identifier: Node): Node | undefined {
  let current: Node | null = identifier
  while (current) {
    if (is.VariableDeclarator(current)) {
      // A for-in or for-of loop assigns its head on every iteration
      const statement = module.parentOf(current)
      const parent = statement && module.parentOf(statement)
      return is.ForInStatement(parent) || is.ForOfStatement(parent)
        ? undefined
        : current
    }
    if (is.TSEnumDeclaration(current) || is.TSModuleDeclaration(current)) {
      return current.id === identifier ? current : undefined
    }
    if (
      is.FunctionDeclaration(current) ||
      is.ClassDeclaration(current) ||
      is.TSDeclareFunction(current)
    ) {
      return current.id === identifier ? current : undefined
    }
    if (
      is.ImportSpecifier(current) ||
      is.ImportDefaultSpecifier(current) ||
      is.ImportNamespaceSpecifier(current)
    ) {
      return current
    }
    if (is.Function(current) || is.Class(current) || is.Program(current)) {
      return undefined
    }
    current = module.parentOf(current)
  }
  return undefined
}

/**
 * Whether a declaration is a statement of its binding's own scope. A `var`
 * nested in another statement, such as a block or a loop head, initializes as
 * part of that statement: its declarator can be removed from it, but the
 * binding has no declaration to move or import on its own.
 */
function declaresInOwnScope(
  module: Module,
  binding: Binding,
  declaration: Node,
): boolean {
  if (!is.VariableDeclarator(declaration)) {
    return true
  }
  let container = module.parentOf(module.parentOf(declaration)!)
  if (is.ExportNamedDeclaration(container)) {
    container = module.parentOf(container)
  }
  const scope = module.scopeOf(declaration)
  return (
    (is.Program(container) ||
      is.BlockStatement(container) ||
      is.StaticBlock(container) ||
      is.SwitchCase(container) ||
      is.TSModuleBlock(container)) &&
    (binding.scope === scope ||
      (scope.kind === 'functionBody' && binding.scope === scope.parent))
  )
}

interface DeclarationIndex extends Pick<
  ModuleDeclarationGraph,
  'declarations' | 'declarationBindings'
> {
  /**
   * Destructuring elements that can be dropped on their own, with the bindings
   * each declares: array pattern elements, and properties of object patterns
   * without a rest element (dropping one would change what the rest collects).
   */
  patternElements: Map<Node, Set<Binding>>
}

function addOwner(
  owners: Map<Node, Set<Binding>>,
  node: Node,
  binding: Binding,
) {
  const bindings = owners.get(node) ?? new Set<Binding>()
  bindings.add(binding)
  owners.set(node, bindings)
}

function declarationIndex(
  module: Module,
  bindings: Array<Binding>,
): DeclarationIndex {
  const declarations = new Map<Binding, Node>()
  const declarationBindings = new Map<Node, Set<Binding>>()
  const patternElements = new Map<Node, Set<Binding>>()
  for (const binding of bindings) {
    // Parameters belong to their function or signature, never to a statement,
    // even when a signature sits in a declaration's type arguments
    if (binding.flags & (BindingFlags.Parameter | BindingFlags.TypeParameter)) {
      continue
    }
    for (const identifier of binding.declarations) {
      const declaration = declarationOf(module, identifier)
      if (!declaration) {
        continue
      }
      const previous = declarations.get(binding)
      if (
        declaresInOwnScope(module, binding, declaration) &&
        (!previous ||
          (is.TSDeclareFunction(previous) &&
            !is.TSDeclareFunction(declaration)))
      ) {
        declarations.set(binding, declaration)
      }
      addOwner(declarationBindings, declaration, binding)
      if (is.VariableDeclarator(declaration)) {
        let element: Node = identifier
        while (element !== declaration.id) {
          const pattern = module.parentOf(element)!
          if (
            is.ArrayPattern(pattern) ||
            (is.ObjectPattern(pattern) &&
              !pattern.properties.some((property) => is.RestElement(property)))
          ) {
            addOwner(patternElements, element, binding)
          }
          element = pattern
        }
      }
    }
  }
  return { declarations, declarationBindings, patternElements }
}

/** Bindings sharing a declarator are one initialization unit. */
export function moduleDeclarationGraph(module: Module): ModuleDeclarationGraph {
  const { declarations, declarationBindings } = declarationIndex(
    module,
    module.rootScope.bindings,
  )
  const dependencies = new Map<Binding, Set<Binding>>()
  for (const [declaration, owners] of declarationBindings) {
    const references = collectModuleReferences(module, declaration)
    for (const binding of owners) {
      const combined = dependencies.get(binding) ?? new Set<Binding>()
      for (const reference of references) {
        if (reference !== binding) {
          combined.add(reference)
        }
      }
      dependencies.set(binding, combined)
    }
  }
  return { declarations, declarationBindings, dependencies }
}

export function expandTransitively<T>(
  roots: Set<T>,
  dependencies: Map<T, Set<T>>,
): Set<T> {
  const expanded = new Set(roots)
  for (const item of expanded) {
    for (const dependency of dependencies.get(item) ?? []) {
      expanded.add(dependency)
    }
  }
  return expanded
}

/** Erase imports/exports that exist only in TypeScript's type space. */
export function stripTypeExports(program: Program): void {
  program.body = program.body.filter((statement) => {
    if (is.ImportDeclaration(statement)) {
      if (statement.importKind === 'type') {
        return false
      }
      const hadSpecifiers = statement.specifiers.length > 0
      statement.specifiers = statement.specifiers.filter(
        (specifier) =>
          !is.ImportSpecifier(specifier) || specifier.importKind !== 'type',
      )
      return !hadSpecifiers || statement.specifiers.length > 0
    }
    if (is.ExportAllDeclaration(statement)) {
      return statement.exportKind !== 'type'
    }
    if (is.ExportNamedDeclaration(statement)) {
      if (
        statement.exportKind === 'type' ||
        is.TSInterfaceDeclaration(statement.declaration) ||
        is.TSTypeAliasDeclaration(statement.declaration)
      ) {
        return false
      }
      const hadSpecifiers = statement.specifiers.length > 0
      statement.specifiers = statement.specifiers.filter(
        (specifier) => specifier.exportKind !== 'type',
      )
      return (
        !!statement.declaration ||
        !hadSpecifiers ||
        statement.specifiers.length > 0
      )
    }
    return true
  })
}

export interface RemoveUnusedBindingsOptions {
  roots?: Iterable<Binding | string>
}

interface BindingUses {
  /** Declarations present in the traced program. */
  present: Set<Binding>
  /** Bindings used outside of any declaration, including exports. */
  roots: Set<Binding>
  /** Bindings used by each declaration's own code. */
  uses: Map<Binding, Set<Binding>>
  /** Declarations that execute only when their enclosing declaration does. */
  parents: Map<Binding, Set<Binding>>
  /**
   * The owners (null outside of any declaration) of each import's erased
   * references: references from types, and for an import named `React`, the
   * JSX that a classic JSX runtime compiles to `React.createElement` calls.
   */
  erasedReferences: Map<Binding, Set<Set<Binding> | null>>
}

interface JsxFactoryNames {
  /** Names JSX elements compile to calls of. */
  element: Array<string>
  /** Names fragments also compile to references of. */
  fragment: Array<string>
}

const jsxFactoryNamesCache = new WeakMap<Module, JsxFactoryNames>()

/**
 * The names a classic JSX runtime compiles JSX to references of, as the
 * file's `@jsx` and `@jsxFrag` pragmas name them (`React.createElement` →
 * `React`). `@jsxRuntime automatic` makes them ignored. The default `React`
 * factory is an erased reference instead (see `BindingUses`).
 */
function jsxFactoryNames(module: Module): JsxFactoryNames {
  let names = jsxFactoryNamesCache.get(module)
  if (!names) {
    names = { element: [], fragment: [] }
    if (
      !module.comments.some((comment) =>
        /@jsxRuntime\s+automatic\b/.test(comment.value),
      )
    ) {
      for (const comment of module.comments) {
        for (const [, pragma, name] of comment.value.matchAll(
          /@(jsx|jsxFrag)\s+([\p{L}\p{N}_$]+)/gu,
        )) {
          names[pragma === 'jsx' ? 'element' : 'fragment'].push(name!)
        }
      }
    }
    jsxFactoryNamesCache.set(module, names)
  }
  return names
}

function jsxFactoriesOf(names: JsxFactoryNames, node: Node): Array<string> {
  return is.JSXFragment(node)
    ? [...names.element, ...names.fragment]
    : names.element
}

function addEdge(
  edges: Map<Binding, Set<Binding>>,
  from: Binding,
  to: Binding,
) {
  const targets = edges.get(from) ?? new Set<Binding>()
  targets.add(to)
  edges.set(from, targets)
}

/**
 * Runtime uses only: TypeScript erases types, so they neither use a declaration
 * nor keep it alive; erased references to imports are recorded apart.
 * `originOf` maps a traced node to its source node, if any.
 */
function collectBindingUses(
  module: Module,
  program: Program,
  index: DeclarationIndex,
  originOf: (node: Node) => Node | undefined,
): BindingUses {
  const byName = new Map(
    module.rootScope.bindings.map((binding) => [binding.name, binding]),
  )
  const result: BindingUses = {
    present: new Set(),
    roots: new Set(),
    uses: new Map(),
    parents: new Map(),
    erasedReferences: new Map(),
  }
  const reactImport = byName.get('React')
  const factories = jsxFactoryNames(module)
  const erasedReference = (owner: Set<Binding> | null, binding: Binding) => {
    if (binding.has(BindingFlags.Import)) {
      const owners = result.erasedReferences.get(binding) ?? new Set()
      owners.add(owner)
      result.erasedReferences.set(binding, owners)
    }
  }
  const ownerStack: Array<Set<Binding> | null> = []
  const scopeStack: Array<Scope> = []
  const use = (owner: Set<Binding> | null, binding: Binding) => {
    if (!owner) {
      result.roots.add(binding)
      return
    }
    for (const source of owner) {
      addEdge(result.uses, source, binding)
    }
  }
  walk(program, {
    enter(node) {
      const original = originOf(node)
      const own = original ? index.declarationBindings.get(original) : undefined
      const parentOwner = ownerStack.at(-1) ?? null
      // A destructuring element's default value and computed key evaluate for
      // its own bindings; the initializer evaluates for all of them.
      const owner =
        own ??
        (original ? index.patternElements.get(original) : undefined) ??
        parentOwner
      ownerStack.push(owner)
      const scope = original
        ? module.scopeOf(original)
        : (scopeStack.at(-1) ?? module.rootScope)
      scopeStack.push(scope)
      for (const binding of own ?? []) {
        result.present.add(binding)
        for (const parent of parentOwner ?? []) {
          addEdge(result.parents, binding, parent)
        }
      }
      // Export records are uses even when there are no lexical references. A
      // transform that removes an export may also remove its declaration graph.
      const markExport = (identifier: Node) => {
        const originalIdentifier = originOf(identifier)
        const binding = originalIdentifier
          ? module.bindingOf(originalIdentifier)
          : byName.get(nameOf(identifier) ?? '')
        if (binding) {
          use(owner, binding)
        }
      }
      if (is.ExportNamedDeclaration(node) && node.declaration) {
        const declaration = node.declaration
        if (is.VariableDeclaration(declaration)) {
          for (const item of declaration.declarations) {
            for (const identifier of bindingIdentifiers(item.id)) {
              markExport(identifier)
            }
          }
        } else if ('id' in declaration && declaration.id) {
          markExport(declaration.id)
        }
      }
      if (
        is.ExportDefaultDeclaration(node) &&
        (is.FunctionDeclaration(node.declaration) ||
          is.ClassDeclaration(node.declaration)) &&
        node.declaration.id
      ) {
        markExport(node.declaration.id)
      }
      if (is.ExportSpecifier(node)) {
        markExport(node.local)
      }
      const reference = original ? module.referenceOf(original) : null
      if (reference?.inTypePosition && reference.binding) {
        erasedReference(owner, reference.binding)
      }
      if (is.JSXElement(node) || is.JSXFragment(node)) {
        if (reactImport) {
          erasedReference(owner, reactImport)
        }
        for (const name of jsxFactoriesOf(factories, node)) {
          const factory = module.lookup(name, { from: scope })
          if (factory) {
            use(owner, factory)
          }
        }
      }
      let binding =
        reference && !reference.inTypePosition ? reference.binding : null
      const generated = generatedReferenceOf(node)
      if (!original && generated) {
        binding =
          typeof generated === 'string'
            ? module.lookup(generated, { from: scope })
            : generated
      }
      if (binding) {
        use(owner, binding)
      }
    },
    leave() {
      ownerStack.pop()
      scopeStack.pop()
    },
  })
  return result
}

/**
 * Declarations that nothing outside their own reference cycle uses at runtime,
 * such as `const stop = subscribe(() => stop())`. They exist for their side
 * effects, or for the TypeScript transform to erase, as imports only used in
 * types (except a classic JSX runtime's `React`, which JSX needs).
 */
function findInitiallyUnused({ present, roots, uses }: BindingUses) {
  // Tarjan's strongly connected components, iterative to bound stack depth
  const order = new Map<Binding, number>()
  const lowLink = new Map<Binding, number>()
  const component = new Map<Binding, Array<Binding>>()
  const stack: Array<Binding> = []
  for (const start of present) {
    if (order.has(start)) {
      continue
    }
    const work: Array<[Binding, Iterator<Binding>]> = []
    const visit = (binding: Binding) => {
      lowLink.set(binding, order.size)
      order.set(binding, order.size)
      stack.push(binding)
      work.push([binding, (uses.get(binding) ?? new Set()).values()])
    }
    visit(start)
    while (work.length) {
      const [binding, targets] = work.at(-1)!
      const next = targets.next()
      if (!next.done) {
        if (!order.has(next.value)) {
          visit(next.value)
        } else if (!component.has(next.value)) {
          lowLink.set(
            binding,
            Math.min(lowLink.get(binding)!, order.get(next.value)!),
          )
        }
        continue
      }
      work.pop()
      const caller = work.at(-1)?.[0]
      if (caller) {
        lowLink.set(
          caller,
          Math.min(lowLink.get(caller)!, lowLink.get(binding)!),
        )
      }
      if (lowLink.get(binding) === order.get(binding)) {
        const members: Array<Binding> = []
        let member: Binding
        do {
          member = stack.pop()!
          members.push(member)
          component.set(member, members)
        } while (member !== binding)
      }
    }
  }
  const used = new Set<Array<Binding>>()
  for (const root of roots) {
    const members = component.get(root)
    if (members) {
      used.add(members)
    }
  }
  for (const [from, targets] of uses) {
    for (const to of targets) {
      const members = component.get(to)
      if (members && members !== component.get(from)) {
        used.add(members)
      }
    }
  }
  return new Set(
    [...present].filter((binding) => !used.has(component.get(binding)!)),
  )
}

interface InitiallyUnused {
  /** Survive wherever their enclosing code does. */
  preserved: Set<Binding>
  /**
   * Imports only types reference, which survive wherever such a reference (or
   * the JSX a classic runtime compiles with them) does.
   */
  erased: Set<Binding>
}

const initiallyUnusedBindings = new WeakMap<Module, InitiallyUnused>()

function initiallyUnused(module: Module, index: DeclarationIndex) {
  let unused = initiallyUnusedBindings.get(module)
  if (!unused) {
    const uses = collectBindingUses(module, module.ast, index, (node) => node)
    const all = findInitiallyUnused(uses)
    const erased = new Set(
      [...all].filter(
        (binding) =>
          binding.has(BindingFlags.Import) &&
          binding.references.some((reference) => reference.inTypePosition),
      ),
    )
    unused = {
      preserved: new Set([...all].filter((binding) => !erased.has(binding))),
      erased,
    }
    initiallyUnusedBindings.set(module, unused)
  }
  return unused
}

/**
 * Rebuild liveness from surviving nodes, using original binding identity. This
 * removes dependencies of erased route options without reparsing generated code.
 * Only declarations the source used, and whose uses the transform erased, are
 * removed: initially unused ones survive wherever their enclosing code does,
 * except imports only types reference, which survive with those references.
 * Callers decide output ownership before invoking this lexical binding cleanup.
 */
export function removeUnusedBindings(
  module: Module,
  program: Program,
  originalNodes: WeakMap<Node, Node>,
  { roots = [] }: RemoveUnusedBindingsOptions = {},
): void {
  stripTypeExports(program)
  const index = declarationIndex(module, module.bindings)
  const { preserved, erased } = initiallyUnused(module, index)
  const output = collectBindingUses(module, program, index, (node) =>
    originalNodes.get(node),
  )
  const byName = new Map(
    module.rootScope.bindings.map((binding) => [binding.name, binding]),
  )
  const live = new Set(output.roots)
  for (const root of roots) {
    const binding = typeof root === 'string' ? byName.get(root) : root
    if (binding) {
      live.add(binding)
    }
  }
  const dependencies = new Map<Binding, Set<Binding>>()
  for (const [from, targets] of output.uses) {
    for (const to of targets) {
      addEdge(dependencies, from, to)
    }
  }
  for (const [binding, parents] of output.parents) {
    for (const parent of parents) {
      // A live nested declaration needs its enclosing code to exist
      addEdge(dependencies, binding, parent)
      // and a preserved one survives wherever its enclosing code does
      if (preserved.has(binding)) {
        addEdge(dependencies, parent, binding)
      }
    }
  }
  for (const binding of output.present) {
    if (preserved.has(binding) && !output.parents.has(binding)) {
      live.add(binding)
    }
  }
  for (const [binding, owners] of output.erasedReferences) {
    if (!erased.has(binding)) {
      continue
    }
    for (const owner of owners) {
      if (!owner) {
        live.add(binding)
        continue
      }
      for (const from of owner) {
        addEdge(dependencies, from, binding)
      }
    }
  }
  const retained = expandTransitively(live, dependencies)
  const removable = new Set(
    [...output.present].filter((binding) => !retained.has(binding)),
  )
  const isRemovable = (node: Node | null) => {
    const original = node && originalNodes.get(node)
    const owners =
      original &&
      (index.declarationBindings.get(original) ??
        index.patternElements.get(original))
    return !!owners && [...owners].every((binding) => removable.has(binding))
  }
  walk(program, {
    enter(node, context) {
      if (isRemovable(node)) {
        context.remove()
      } else if (is.ObjectPattern(node)) {
        node.properties = node.properties.filter(
          (property) => !isRemovable(property),
        )
      } else if (is.ArrayPattern(node)) {
        // Holes keep the positions of the remaining elements
        node.elements = node.elements.map((element) =>
          isRemovable(element) ? null : element,
        )
      }
    },
    leave(node, context) {
      if (is.VariableDeclaration(node) && node.declarations.length === 0) {
        // A statement slot, as in `if (x) var y = z`, cannot be left empty;
        // a statement list, a loop head and an `export` can.
        if (
          context.index === null &&
          context.key !== 'init' &&
          context.key !== 'declaration'
        ) {
          context.replace(b.BlockStatement({ body: [] }))
        } else {
          context.remove()
        }
      } else if (is.ImportDeclaration(node) && node.specifiers.length === 0) {
        const original = originalNodes.get(node)
        if (
          original &&
          is.ImportDeclaration(original) &&
          original.specifiers.length > 0
        ) {
          context.remove()
        }
      } else if (
        is.ExportNamedDeclaration(node) &&
        !node.declaration &&
        node.specifiers.length === 0 &&
        !node.source
      ) {
        context.remove()
      }
    },
  })

  const referencedNames = new Set<string>()
  const factories = jsxFactoryNames(module)
  walk(program, {
    enter(node) {
      if (is.JSXElement(node) || is.JSXFragment(node)) {
        for (const name of jsxFactoriesOf(factories, node)) {
          referencedNames.add(name)
        }
      }
      const original = originalNodes.get(node)
      if (original) {
        const reference = module.referenceOf(original)
        if (reference && !reference.inTypePosition) {
          referencedNames.add(reference.name)
        }
      } else {
        const generated = generatedReferenceOf(node)
        if (generated) {
          referencedNames.add(
            typeof generated === 'string' ? generated : generated.name,
          )
        }
      }
    },
  })
  program.body = program.body.filter((statement) => {
    if (
      !is.ImportDeclaration(statement) ||
      originalNodes.has(statement) ||
      statement.specifiers.length === 0
    ) {
      return true
    }
    statement.specifiers = statement.specifiers.filter((specifier) =>
      referencedNames.has(specifier.local.name),
    )
    return statement.specifiers.length > 0
  })
}

export type ModuleInfoBinding =
  | { type: 'import'; source: string; importedName: string }
  | { type: 'var'; init: Expression | null }

export interface ExtractedModuleInfo {
  bindings: Map<string, ModuleInfoBinding>
  exports: Map<string, string>
  reExportAllSources: Array<string>
}

/** The bundler owns cross-module resolution; Yuku provides local module records. */
export function extractModuleInfo(sourceModule: Module): ExtractedModuleInfo {
  const bindings = new Map<string, ModuleInfoBinding>()
  const exportBindings = new Map<string, string>()
  const reExportAllSources: Array<string> = []
  const graph = declarationIndex(sourceModule, sourceModule.rootScope.bindings)
  for (const [binding, declaration] of graph.declarations) {
    bindings.set(binding.name, {
      type: 'var',
      init: is.VariableDeclarator(declaration) ? declaration.init : null,
    })
  }
  for (const record of sourceModule.imports) {
    if (record.local && record.specifier && !record.typeOnly) {
      bindings.set(record.local.name, {
        type: 'import',
        source: record.specifier,
        importedName: record.isNamespace ? '*' : (record.name ?? 'default'),
      })
    }
  }
  let syntheticIndex = 0
  const syntheticName = () => {
    let name: string
    do {
      name = `__module_export_${syntheticIndex++}__`
    } while (bindings.has(name))
    return name
  }
  for (const record of sourceModule.exports) {
    if (record.typeOnly) {
      continue
    }
    if (record.kind === 'star' && record.specifier) {
      reExportAllSources.push(record.specifier)
    } else if (record.name) {
      if (record.local) {
        exportBindings.set(record.name, record.local.name)
      } else if (record.specifier) {
        const name = syntheticName()
        bindings.set(name, {
          type: 'import',
          source: record.specifier,
          importedName:
            record.kind === 'namespace'
              ? '*'
              : (record.fromName ?? record.name),
        })
        exportBindings.set(record.name, name)
      } else if (record.name === 'default') {
        const statement = sourceModule.ast.body.find(
          is.ExportDefaultDeclaration,
        )
        if (statement) {
          const declaration = statement.declaration
          const name = syntheticName()
          bindings.set(name, {
            type: 'var',
            init: is.Expression(declaration) ? declaration : null,
          })
          exportBindings.set('default', name)
        }
      }
    }
  }
  return { bindings, exports: exportBindings, reExportAllSources }
}

export { unwrap as unwrapExpression } from 'yuku-ast'
