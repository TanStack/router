import MagicString from 'magic-string'
import { compileToVolarMappings } from 'octane/compiler/volar'

const START_MODULE = '@tanstack/octane-start'
const ROUTER_MODULE = '@tanstack/octane-router'

type AstNode = {
  type?: string
  start?: number
  end?: number
  name?: string
  value?: unknown
  importKind?: string
  imported?: AstNode
  local?: AstNode
  source?: AstNode
  specifiers?: Array<AstNode>
  declarations?: Array<AstNode>
  declaration?: AstNode
  id?: AstNode
  params?: Array<AstNode>
  body?: AstNode | Array<AstNode>
  openingElement?: AstNode
  children?: Array<AstNode>
  [key: string]: unknown
}

type Replacement = {
  start: number
  end: number
  content: string
}

export function transformOctaneStartSource(
  code: string,
  id: string,
  options: { server: boolean },
) {
  if (!code.includes('Hydrate') && !code.includes('ClientOnly')) {
    return undefined
  }

  const filename = id.split('?', 1)[0]!
  const { sourceAst } = compileToVolarMappings(code, filename)
  const program = sourceAst as AstNode
  const clientOnlyReplacements = options.server
    ? stripClientOnlyChildren(program)
    : []
  const prunedImportSpecifiers = options.server
    ? findImportsUsedOnlyInRanges(program, clientOnlyReplacements)
    : new Map<AstNode, Set<AstNode>>()
  const replacements = [
    ...rewriteImports(code, program, prunedImportSpecifiers),
    ...clientOnlyReplacements,
  ]

  if (replacements.length === 0) {
    return undefined
  }

  const output = new MagicString(code)
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output.overwrite(replacement.start, replacement.end, replacement.content)
  }

  return {
    code: output.toString(),
    map: output.generateMap({
      source: filename,
      includeContent: true,
      hires: true,
    }),
  }
}

// Octane already owns a complete deferred-hydration runtime and TSRX-aware
// splitter. Rewrite the Start facade import to its native source before the
// Octane compiler runs, while leaving every other Start import untouched.
function rewriteImports(
  code: string,
  program: AstNode,
  prunedImportSpecifiers: ReadonlyMap<AstNode, ReadonlySet<AstNode>>,
) {
  const replacements: Array<Replacement> = []

  for (const statement of asNodes(program.body)) {
    if (
      statement.type !== 'ImportDeclaration' ||
      !hasRange(statement) ||
      !hasRange(statement.source)
    ) {
      continue
    }

    const prunedSpecifiers = prunedImportSpecifiers.get(statement)
    const hydrateSpecifiers: Array<AstNode> = []
    const remainingSpecifiers: Array<AstNode> = []
    for (const specifier of statement.specifiers ?? []) {
      if (prunedSpecifiers?.has(specifier)) {
        continue
      }
      if (
        statement.importKind !== 'type' &&
        statement.source.value === START_MODULE &&
        specifier.type === 'ImportSpecifier' &&
        specifier.importKind !== 'type' &&
        specifier.imported?.name === 'Hydrate'
      ) {
        hydrateSpecifiers.push(specifier)
      } else {
        remainingSpecifiers.push(specifier)
      }
    }

    if (!prunedSpecifiers?.size && hydrateSpecifiers.length === 0) {
      continue
    }

    const remainingImport = printRemainingImport(
      code,
      statement,
      remainingSpecifiers,
    )
    if (hydrateSpecifiers.length === 0) {
      replacements.push({
        start: statement.start,
        end: statement.end,
        content: remainingImport,
      })
      continue
    }

    const hydrateImports = hydrateSpecifiers
      .map((specifier) => {
        const localName = specifier.local?.name ?? 'Hydrate'
        return localName === 'Hydrate' ? 'Hydrate' : `Hydrate as ${localName}`
      })
      .join(', ')
    const nativeImport = `import { ${hydrateImports} } from 'octane'`
    replacements.push({
      start: statement.start,
      end: statement.end,
      content: remainingImport
        ? `${nativeImport}\n${remainingImport}`
        : nativeImport,
    })
  }

  return replacements
}

type ImportBindingUsage = {
  declaration: AstNode
  specifier: AstNode
  removed: boolean
  live: boolean
}

function findImportsUsedOnlyInRanges(
  program: AstNode,
  removedRanges: ReadonlyArray<Replacement>,
) {
  const bindings = new Map<string, ImportBindingUsage>()
  for (const statement of asNodes(program.body)) {
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.importKind === 'type'
    ) {
      continue
    }
    for (const specifier of statement.specifiers ?? []) {
      const localName = specifier.local?.name
      if (specifier.importKind === 'type' || !localName) {
        continue
      }
      bindings.set(localName, {
        declaration: statement,
        specifier,
        removed: false,
        live: false,
      })
    }
  }

  if (bindings.size === 0 || removedRanges.length === 0) {
    return new Map<AstNode, Set<AstNode>>()
  }

  visitImportedBindingReferences(program, bindings, removedRanges)

  const result = new Map<AstNode, Set<AstNode>>()
  for (const usage of bindings.values()) {
    // An already-unused import may still intentionally initialize its module.
    // Only remove bindings whose actual uses disappeared with ClientOnly.
    if (!usage.removed || usage.live) {
      continue
    }
    const specifiers = result.get(usage.declaration) ?? new Set<AstNode>()
    specifiers.add(usage.specifier)
    result.set(usage.declaration, specifiers)
  }
  return result
}

function visitImportedBindingReferences(
  program: AstNode,
  bindings: ReadonlyMap<string, ImportBindingUsage>,
  removedRanges: ReadonlyArray<Replacement>,
) {
  const visit = (
    value: unknown,
    shadowed: ReadonlySet<string>,
    parent?: AstNode,
    parentKey?: string,
    bindingPattern = false,
  ) => {
    if (!value || typeof value !== 'object') {
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, shadowed, parent, parentKey, bindingPattern)
      }
      return
    }

    const node = value as AstNode
    if (node.type === 'ImportDeclaration') {
      return
    }

    const scopedNames = scopeBindings(node)
    const nextShadowed = scopedNames.size
      ? new Set([...shadowed, ...scopedNames])
      : shadowed

    if (
      !bindingPattern &&
      isBindingReference(node, parent, parentKey) &&
      node.name &&
      !nextShadowed.has(node.name)
    ) {
      const usage = bindings.get(node.name)
      if (usage && hasRange(node)) {
        if (isInsideRange(node, removedRanges)) {
          usage.removed = true
        } else {
          usage.live = true
        }
      }
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === 'metadata' || key === 'loc' || key === 'parent') {
        continue
      }
      visit(
        child,
        nextShadowed,
        node,
        key,
        isBindingPatternChild(node, key, bindingPattern),
      )
    }
  }

  visit(program, new Set())
}

function isBindingReference(
  node: AstNode,
  parent: AstNode | undefined,
  parentKey: string | undefined,
) {
  if (node.type === 'Identifier') {
    if (!parent) {
      return true
    }
    if (
      (parent.type === 'MemberExpression' ||
        parent.type === 'OptionalMemberExpression') &&
      parentKey === 'property' &&
      !parent.computed
    ) {
      return false
    }
    if (
      (parent.type === 'Property' ||
        parent.type === 'PropertyDefinition' ||
        parent.type === 'MethodDefinition') &&
      parentKey === 'key' &&
      !parent.computed
    ) {
      return Boolean(parent.shorthand)
    }
    if (parent.type === 'ExportSpecifier') {
      return parentKey === 'local'
    }
    if (
      (parent.type === 'LabeledStatement' ||
        parent.type === 'BreakStatement' ||
        parent.type === 'ContinueStatement') &&
      parentKey === 'label'
    ) {
      return false
    }
    return true
  }

  if (node.type !== 'JSXIdentifier' || !node.name || !parent) {
    return false
  }
  if (
    (parent.type === 'JSXOpeningElement' ||
      parent.type === 'JSXClosingElement') &&
    parentKey === 'name'
  ) {
    return true
  }
  return parent.type === 'JSXMemberExpression' && parentKey === 'object'
}

function isBindingPatternChild(
  parent: AstNode,
  key: string,
  parentIsBindingPattern: boolean,
) {
  if (parentIsBindingPattern) {
    if (parent.type === 'AssignmentPattern') {
      return key === 'left'
    }
    if (parent.type === 'Property') {
      return key === 'value' || (key === 'key' && !parent.computed)
    }
    return true
  }

  if (parent.type === 'VariableDeclarator') {
    return key === 'id'
  }
  if (isFunction(parent)) {
    return key === 'id' || key === 'params'
  }
  if (parent.type === 'ClassDeclaration' || parent.type === 'ClassExpression') {
    return key === 'id'
  }
  if (parent.type === 'CatchClause') {
    return key === 'param'
  }
  if (parent.type === 'ImportSpecifier') {
    return true
  }
  return false
}

function isInsideRange(
  node: AstNode & { start: number; end: number },
  ranges: ReadonlyArray<Replacement>,
) {
  return ranges.some(
    (range) => range.start <= node.start && range.end >= node.end,
  )
}

function printRemainingImport(
  code: string,
  statement: AstNode,
  specifiers: Array<AstNode>,
) {
  const sourceNode = statement.source
  if (specifiers.length === 0 || !sourceNode || !hasRange(sourceNode)) {
    return ''
  }

  const defaultSpecifier = specifiers.find(
    (specifier) => specifier.type === 'ImportDefaultSpecifier',
  )
  const namespaceSpecifier = specifiers.find(
    (specifier) => specifier.type === 'ImportNamespaceSpecifier',
  )
  const namedSpecifiers = specifiers.filter(
    (specifier) => specifier.type === 'ImportSpecifier',
  )
  const clauses: Array<string> = []

  if (defaultSpecifier && hasRange(defaultSpecifier)) {
    clauses.push(code.slice(defaultSpecifier.start, defaultSpecifier.end))
  }
  if (namespaceSpecifier && hasRange(namespaceSpecifier)) {
    clauses.push(code.slice(namespaceSpecifier.start, namespaceSpecifier.end))
  }
  if (namedSpecifiers.length > 0) {
    clauses.push(
      `{ ${namedSpecifiers
        .filter(hasRange)
        .map((specifier) => code.slice(specifier.start, specifier.end))
        .join(', ')} }`,
    )
  }

  const source = code.slice(sourceNode.start, sourceNode.end)
  const suffix = hasRange(statement)
    ? code.slice(sourceNode.end, statement.end)
    : ''
  return `import ${clauses.join(', ')} from ${source}${suffix}`
}

function stripClientOnlyChildren(program: AstNode) {
  const importedNames = new Set<string>()
  for (const statement of asNodes(program.body)) {
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.importKind === 'type' ||
      statement.source?.value !== ROUTER_MODULE
    ) {
      continue
    }

    for (const specifier of statement.specifiers ?? []) {
      if (
        specifier.type === 'ImportSpecifier' &&
        specifier.importKind !== 'type' &&
        specifier.imported?.name === 'ClientOnly' &&
        specifier.local?.name
      ) {
        importedNames.add(specifier.local.name)
      }
    }
  }

  if (importedNames.size === 0) {
    return []
  }

  const replacements: Array<Replacement> = []
  const visited = new WeakSet<object>()

  const visit = (value: unknown, shadowed: ReadonlySet<string>) => {
    if (!value || typeof value !== 'object' || visited.has(value)) {
      return
    }
    visited.add(value)

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, shadowed)
      }
      return
    }

    const node = value as AstNode
    const scopedNames = scopeBindings(node)
    const nextShadowed = scopedNames.size
      ? new Set([...shadowed, ...scopedNames])
      : shadowed
    const elementName = (node.openingElement?.name as AstNode | undefined)?.name

    if (
      node.type === 'JSXElement' &&
      elementName &&
      importedNames.has(elementName) &&
      !nextShadowed.has(elementName) &&
      node.children?.length
    ) {
      const first = node.children[0]
      const last = node.children[node.children.length - 1]
      if (
        first &&
        last &&
        hasRange(first) &&
        hasRange(last) &&
        last.end > first.start
      ) {
        replacements.push({
          start: first.start,
          end: last.end,
          content: '{null}',
        })
      }
    }

    for (const [key, child] of Object.entries(node)) {
      if (key !== 'metadata' && key !== 'loc' && key !== 'parent') {
        visit(child, nextShadowed)
      }
    }
  }

  visit(program, new Set())

  // An outer ClientOnly replacement already removes every nested child span.
  return replacements.filter(
    (candidate, index) =>
      !replacements.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.start <= candidate.start &&
          other.end >= candidate.end,
      ),
  )
}

function scopeBindings(node: AstNode) {
  const names = new Set<string>()

  if (isFunction(node)) {
    for (const param of node.params ?? []) {
      collectBindingNames(param, names)
    }
    collectBindingNames(node.id, names)
    for (const statement of directStatements(node.body)) {
      collectStatementBindings(statement, names)
    }
    collectFunctionVarBindings(node.body, names)
  } else if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
    for (const statement of directStatements(node)) {
      collectStatementBindings(statement, names)
    }
  } else if (node.type === 'CatchClause') {
    collectBindingNames(node.param as AstNode | undefined, names)
  } else if (
    node.type === 'ForStatement' ||
    node.type === 'ForInStatement' ||
    node.type === 'ForOfStatement'
  ) {
    const declaration = (node.init ?? node.left) as AstNode | undefined
    if (
      declaration?.type === 'VariableDeclaration' &&
      declaration.kind !== 'var'
    ) {
      for (const item of declaration.declarations ?? []) {
        collectBindingNames(item.id, names)
      }
    }
  } else if (node.type === 'SwitchStatement') {
    for (const switchCase of asNodes(node.cases)) {
      for (const statement of asNodes(switchCase.consequent)) {
        collectStatementBindings(statement, names)
      }
    }
  } else if (node.type === 'StaticBlock') {
    for (const statement of directStatements(node)) {
      collectStatementBindings(statement, names)
    }
  } else if (
    node.type === 'ClassDeclaration' ||
    node.type === 'ClassExpression'
  ) {
    collectBindingNames(node.id, names)
  }

  return names
}

function directStatements(node: AstNode['body']) {
  if (Array.isArray(node)) {
    return node
  }
  if (!node || !Array.isArray(node.body)) {
    return []
  }
  return asNodes(node.body)
}

function collectStatementBindings(statement: AstNode, output: Set<string>) {
  const declaration =
    statement.type === 'ExportNamedDeclaration' ||
    statement.type === 'ExportDefaultDeclaration'
      ? statement.declaration
      : statement

  if (declaration?.type === 'VariableDeclaration') {
    for (const item of declaration.declarations ?? []) {
      collectBindingNames(item.id, output)
    }
  } else if (
    declaration?.type === 'FunctionDeclaration' ||
    declaration?.type === 'ClassDeclaration'
  ) {
    collectBindingNames(declaration.id, output)
  }
}

function collectFunctionVarBindings(value: unknown, output: Set<string>) {
  const visited = new WeakSet<object>()
  const visit = (child: unknown, root = false) => {
    if (!child || typeof child !== 'object' || visited.has(child)) {
      return
    }
    visited.add(child)

    if (Array.isArray(child)) {
      for (const item of child) {
        visit(item)
      }
      return
    }

    const node = child as AstNode
    if (!root && isFunction(node)) {
      return
    }
    if (node.type === 'VariableDeclaration' && node.kind === 'var') {
      for (const item of node.declarations ?? []) {
        collectBindingNames(item.id, output)
      }
    }
    for (const [key, nested] of Object.entries(node)) {
      if (key !== 'metadata' && key !== 'loc' && key !== 'parent') {
        visit(nested)
      }
    }
  }

  visit(value, true)
}

function collectBindingNames(
  pattern: AstNode | undefined,
  output: Set<string>,
) {
  if (!pattern) {
    return
  }
  if (pattern.type === 'Identifier' && pattern.name) {
    output.add(pattern.name)
    return
  }
  if (pattern.type === 'RestElement') {
    collectBindingNames(pattern.argument as AstNode | undefined, output)
    return
  }
  if (pattern.type === 'AssignmentPattern') {
    collectBindingNames(pattern.left as AstNode | undefined, output)
    return
  }
  if (pattern.type === 'ArrayPattern') {
    for (const element of asNodes(pattern.elements)) {
      collectBindingNames(element, output)
    }
    return
  }
  if (pattern.type === 'ObjectPattern') {
    for (const property of asNodes(pattern.properties)) {
      collectBindingNames(
        (property.argument ?? property.value) as AstNode | undefined,
        output,
      )
    }
  }
}

function isFunction(node: AstNode) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  )
}

function hasRange(node: AstNode | null | undefined): node is AstNode & {
  start: number
  end: number
} {
  return typeof node?.start === 'number' && typeof node.end === 'number'
}

function asNodes(value: unknown): Array<AstNode> {
  return Array.isArray(value) ? (value as Array<AstNode>) : []
}
