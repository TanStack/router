import { stripVTControlCharacters } from 'node:util'
import { parseSync, transformWithOxc } from 'vite'
import type { ESTree } from 'vite'

/**
 * Validates generated code the way a browser or bundler sees it, without using
 * the compiler's own parser: erase TypeScript (keeping every value import) and
 * parse the result as a JavaScript module with semantic checks. This rejects
 * syntax errors, nameless function/class declarations, duplicate bindings
 * (including an import redeclared by a local declaration) and exports of
 * undeclared bindings.
 *
 * It also rejects references to names that are neither declared nor imported
 * in the module, once JSX is compiled the way a bundler compiles it (so a
 * classic `@jsx` or `@jsxFrag` pragma reads its factory or fragment, and
 * `@jsxImportSource` its runtime module): such a reference throws a
 * ReferenceError when it runs. Known globals of browsers and Node.js, names
 * the module probes with `typeof`, and `globals` (e.g. the globals the route
 * file itself reads) are allowed.
 *
 * @returns the error messages; an empty array means the module is valid.
 */
export async function getModuleErrors(
  code: string,
  filename = 'module.tsx',
  options: { globals?: Iterable<string> } = {},
): Promise<Array<string>> {
  let javascript: string
  try {
    const result = await transformWithOxc(code, filename, {
      jsx: 'preserve',
      typescript: { onlyRemoveTypeImports: true },
    })
    javascript = result.code
  } catch (error) {
    return [stripVTControlCharacters((error as Error).message)]
  }
  const { errors } = parseSync('module.jsx', javascript, {
    sourceType: 'module',
    showSemanticErrors: true,
  })
  if (errors.length > 0) {
    return errors.map((error) => error.message)
  }
  const allowed = new Set(options.globals)
  return [...(await freeIdentifiers(code, filename, { deadCode: false }))]
    .filter((name) => !allowed.has(name))
    .map((name) => `\`${name}\` is referenced but never declared or imported`)
}

/**
 * Names a module references without declaring or importing them, other than
 * known globals and names it probes with `typeof`, once TypeScript is erased
 * and JSX compiled with the project default (React's automatic runtime) or
 * the module's own JSX pragmas (a `@jsx` or `@jsxFrag` pragma alone selects
 * the classic runtime, see `jsxRuntime`).
 *
 * `deadCode: false` leaves out names referenced only inside code that never
 * runs (`getModuleErrors` does: such a reference throws nothing). Dead code
 * is approximated statically as the module-level functions that are not
 * exported and that no other code of the module reads, directly or through
 * other such functions: a `function` declaration, or a `const`/`let`/`var`
 * initialised with a function or arrow expression, whose name the module
 * declares once. Reads by anything else (module-level code, exports, classes,
 * `typeof`, assignments) keep a function live; anything undecidable stays
 * live.
 */
export async function freeIdentifiers(
  code: string,
  filename = 'module.tsx',
  options: { deadCode?: boolean } = {},
): Promise<Set<string>> {
  const { code: javascript } = await transformWithOxc(code, filename, {
    jsx: { runtime: jsxRuntime(code, filename) },
    typescript: { onlyRemoveTypeImports: true },
  })
  const { program } = parseSync('module.js', javascript, {
    sourceType: 'module',
  })
  const { references, probed, isOnlyInDeadCode } = analyzeScopes(program)
  return new Set(
    [...references].filter(
      (name) =>
        !probed.has(name) &&
        !isKnownGlobal(name) &&
        (options.deadCode !== false || !isOnlyInDeadCode(name)),
    ),
  )
}

/**
 * The JSX runtime a module is compiled with. Oxc (the transform of Vite) and
 * the other bundlers' transforms read the module's `@jsxRuntime`,
 * `@jsxImportSource`, `@jsx` and `@jsxFrag` pragmas themselves; this only
 * picks the default they start from.
 *
 * The default is React's automatic runtime, except for a module that sets
 * `@jsx` or `@jsxFrag` without `@jsxRuntime` or `@jsxImportSource`: that
 * module is compiled with the classic runtime, so its factory and fragment
 * names are read. Under the automatic runtime such a pragma means nothing
 * (Oxc and TypeScript ignore it, esbuild ignores it with a warning) or
 * fails the build (SWC, so Rspack, and Babel reject it), so the module only
 * works as written in a project whose default runtime is classic.
 *
 * Pragmas anywhere in the module count here, while Oxc only reads the ones
 * that lead the module: a compiler that inserts code above a pragma still
 * outputs a module of the same (classic) project, whose JSX Oxc then
 * compiles with the default factory (`React.createElement`).
 */
function jsxRuntime(code: string, filename: string): 'classic' | 'automatic' {
  const { comments } = parseSync(filename, code, { sourceType: 'module' })
  const pragmas = new Set<string>()
  for (const comment of comments) {
    for (const match of comment.value.matchAll(
      /@jsx(Runtime|ImportSource|Frag)?\s+(\S+)/g,
    )) {
      const pragma = match[1] ?? ''
      if (pragma === 'Runtime') {
        // Oxc honours the module's own `@jsxRuntime` over the default.
        return match[2] === 'classic' ? 'classic' : 'automatic'
      }
      pragmas.add(pragma)
    }
  }
  return !pragmas.has('ImportSource') &&
    (pragmas.has('') || pragmas.has('Frag'))
    ? 'classic'
    : 'automatic'
}

/**
 * Names a module declares at runtime, at any depth: variables (every
 * declarator, destructured bindings included), functions, classes, enums
 * and namespaces. Imports, parameters, types and ambient (`declare`)
 * declarations do not count. `filename` gives the module's language.
 */
export function declaredNames(
  code: string,
  filename = 'module.tsx',
): Set<string> {
  const { program, errors } = parseSync(filename, code, {
    sourceType: 'module',
  })
  if (errors.length > 0) {
    throw new Error(
      `cannot list the declarations of an invalid module: ${errors[0]!.message}`,
    )
  }
  const names = new Set<string>()
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!isNode(node) || node.declare === true) {
      return
    }
    switch (node.type) {
      case 'VariableDeclarator':
        patternNames(node.id).forEach((name) => names.add(name))
        break
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
      case 'TSEnumDeclaration':
      case 'TSModuleDeclaration':
        if (isNode(node.id)) {
          // `namespace A.B {}` declares `A`.
          let id: Node = node.id
          while (id.type === 'TSQualifiedName' && isNode(id.left)) {
            id = id.left
          }
          if (id.type === 'Identifier') {
            names.add(id.name as string)
          }
        }
        break
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'type' && typeof value === 'object') {
        visit(value)
      }
    }
  }
  visit(program)
  return names
}

/** Globals of browsers that Node.js does not define. */
const browserGlobals = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'self',
  'top',
  'parent',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'getComputedStyle',
  'matchMedia',
  'scrollTo',
  'alert',
  'HTMLElement',
  'Element',
  'Node',
  'customElements',
  'IntersectionObserver',
  'ResizeObserver',
  'MutationObserver',
]
const knownGlobals = new Set([
  ...Object.getOwnPropertyNames(globalThis),
  ...browserGlobals,
])

function isKnownGlobal(name: string) {
  return knownGlobals.has(name)
}

type Scope = {
  parent: Scope | undefined
  names: Set<string>
  /** The scope `var` declarations of this scope belong to. */
  varScope: Scope
}

function createScope(parent: Scope | undefined, isVarScope: boolean): Scope {
  const scope = { parent, names: new Set<string>() } as Scope
  scope.varScope = isVarScope || !parent ? scope : parent.varScope
  return scope
}

type Node = { type: string; [key: string]: unknown }

function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

/** Names a binding pattern declares. */
function patternNames(pattern: unknown, names: Array<string> = []) {
  if (!isNode(pattern)) {
    return names
  }
  switch (pattern.type) {
    case 'Identifier':
      names.push(pattern.name as string)
      break
    case 'ObjectPattern':
      for (const property of pattern.properties as Array<Node>) {
        patternNames(
          property.type === 'RestElement' ? property.argument : property.value,
          names,
        )
      }
      break
    case 'ArrayPattern':
      for (const element of pattern.elements as Array<Node | null>) {
        patternNames(element, names)
      }
      break
    case 'AssignmentPattern':
      patternNames(pattern.left, names)
      break
    case 'RestElement':
      patternNames(pattern.argument, names)
      break
  }
  return names
}

const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])

/** Declares the `var` bindings of a function body, wherever they are nested. */
function declareVars(node: unknown, scope: Scope) {
  if (Array.isArray(node)) {
    node.forEach((child) => declareVars(child, scope))
    return
  }
  if (!isNode(node) || functionTypes.has(node.type)) {
    return
  }
  if (node.type === 'StaticBlock') {
    return
  }
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    for (const declarator of node.declarations as Array<Node>) {
      patternNames(declarator.id).forEach((name) => scope.names.add(name))
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'type' && typeof value === 'object') {
      declareVars(value, scope)
    }
  }
}

/** Declares the lexical bindings (and imports) of a statement list. */
function declareLexical(statements: Array<Node>, scope: Scope) {
  for (const statement of statements) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
        ? (statement.declaration as Node | null)
        : statement
    if (!declaration) {
      continue
    }
    switch (declaration.type) {
      case 'VariableDeclaration':
        if (declaration.kind !== 'var') {
          for (const declarator of declaration.declarations as Array<Node>) {
            patternNames(declarator.id).forEach((name) => scope.names.add(name))
          }
        }
        break
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
        if (isNode(declaration.id)) {
          scope.names.add(declaration.id.name as string)
        }
        break
      case 'ImportDeclaration':
        for (const specifier of declaration.specifiers as Array<Node>) {
          scope.names.add((specifier.local as Node).name as string)
        }
        break
    }
  }
}

/**
 * Walks a program and returns the names it references without a declaration
 * in scope, and the names it probes with `typeof`.
 */
function analyzeScopes(program: ESTree.Program) {
  const references = new Set<string>()
  const probed = new Set<string>()
  const moduleScope = createScope(undefined, true)
  const body = program.body as unknown as Array<Node>
  /** Module-level functions that may be dead (see `freeIdentifiers`). */
  const candidates = deadCodeCandidates(body)
  /** The candidate whose body is being visited (`undefined`: other code). */
  let owner: string | undefined
  /** Candidates each candidate (or other code, `undefined`) reads. */
  const reads = new Map<string | undefined, Set<string>>()
  /** Where each free name is referenced. */
  const freeOwners = new Map<string, Set<string | undefined>>()

  /** Resolves `name` from `scope`; true when it is declared. */
  const resolve = (name: string, scope: Scope) => {
    for (
      let current: Scope | undefined = scope;
      current;
      current = current.parent
    ) {
      if (current.names.has(name)) {
        if (current === moduleScope && candidates.has(name)) {
          const read = reads.get(owner) ?? new Set<string>()
          read.add(name)
          reads.set(owner, read)
        }
        return true
      }
    }
    return false
  }

  const reference = (name: string, scope: Scope) => {
    if (resolve(name, scope)) {
      return
    }
    references.add(name)
    const owners = freeOwners.get(name) ?? new Set<string | undefined>()
    owners.add(owner)
    freeOwners.set(name, owners)
  }

  /** Visits a binding pattern: only defaults and computed keys are read. */
  const visitBinding = (pattern: unknown, scope: Scope) => {
    if (!isNode(pattern)) {
      return
    }
    switch (pattern.type) {
      case 'Identifier':
        return
      case 'ObjectPattern':
        for (const property of pattern.properties as Array<Node>) {
          if (property.type === 'RestElement') {
            visitBinding(property.argument, scope)
          } else {
            if (property.computed) {
              visit(property.key, scope)
            }
            visitBinding(property.value, scope)
          }
        }
        return
      case 'ArrayPattern':
        for (const element of pattern.elements as Array<Node | null>) {
          visitBinding(element, scope)
        }
        return
      case 'AssignmentPattern':
        visitBinding(pattern.left, scope)
        visit(pattern.right, scope)
        return
      case 'RestElement':
        visitBinding(pattern.argument, scope)
        return
      default:
        // Assignment targets such as member expressions.
        visit(pattern, scope)
    }
  }

  /** Visits an assignment target: identifiers in it are references. */
  const visitTarget = (pattern: unknown, scope: Scope) => {
    if (!isNode(pattern)) {
      return
    }
    switch (pattern.type) {
      case 'ObjectPattern':
        for (const property of pattern.properties as Array<Node>) {
          if (property.type === 'RestElement') {
            visitTarget(property.argument, scope)
          } else {
            if (property.computed) {
              visit(property.key, scope)
            }
            visitTarget(property.value, scope)
          }
        }
        return
      case 'ArrayPattern':
        for (const element of pattern.elements as Array<Node | null>) {
          visitTarget(element, scope)
        }
        return
      case 'AssignmentPattern':
        visitTarget(pattern.left, scope)
        visit(pattern.right, scope)
        return
      case 'RestElement':
        visitTarget(pattern.argument, scope)
        return
      default:
        visit(pattern, scope)
    }
  }

  const visitBody = (statements: Array<Node>, scope: Scope) => {
    declareLexical(statements, scope)
    statements.forEach((statement) => visit(statement, scope))
  }

  const visitFunction = (node: Node, outer: Scope) => {
    const scope = createScope(outer, true)
    if (node.type === 'FunctionExpression' && isNode(node.id)) {
      scope.names.add(node.id.name as string)
    }
    if (node.type !== 'ArrowFunctionExpression') {
      scope.names.add('arguments')
    }
    for (const param of node.params as Array<Node>) {
      patternNames(param).forEach((name) => scope.names.add(name))
    }
    for (const param of node.params as Array<Node>) {
      visitBinding(param, scope)
    }
    const body = node.body as Node
    if (body.type === 'BlockStatement') {
      declareVars(body.body, scope)
      visitBody(body.body as Array<Node>, scope)
    } else {
      visit(body, scope)
    }
  }

  const visitClass = (node: Node, outer: Scope) => {
    for (const decorator of (node.decorators as Array<Node> | undefined) ??
      []) {
      visit(decorator, outer)
    }
    visit(node.superClass, outer)
    const scope = createScope(outer, false)
    if (isNode(node.id)) {
      scope.names.add(node.id.name as string)
    }
    for (const member of (node.body as Node).body as Array<Node>) {
      for (const decorator of (member.decorators as Array<Node> | undefined) ??
        []) {
        visit(decorator, scope)
      }
      if (member.type === 'StaticBlock') {
        const block = createScope(scope, true)
        declareVars(member.body, block)
        visitBody(member.body as Array<Node>, block)
        continue
      }
      if (member.computed) {
        visit(member.key, scope)
      }
      if (member.value) {
        // Field initializers run as methods: `arguments` is not theirs.
        visit(member.value, createScope(scope, true))
      }
    }
  }

  const visit = (node: unknown, scope: Scope): void => {
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, scope))
      return
    }
    if (!isNode(node)) {
      return
    }
    switch (node.type) {
      case 'Identifier':
        reference(node.name as string, scope)
        return
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        visitFunction(node, scope)
        return
      case 'ClassDeclaration':
      case 'ClassExpression':
        visitClass(node, scope)
        return
      case 'BlockStatement':
        visitBody(node.body as Array<Node>, createScope(scope, false))
        return
      case 'StaticBlock':
        return
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement': {
        const loop = createScope(scope, false)
        const head = (
          node.type === 'ForStatement' ? node.init : node.left
        ) as Node | null
        if (head?.type === 'VariableDeclaration') {
          if (head.kind !== 'var') {
            for (const declarator of head.declarations as Array<Node>) {
              patternNames(declarator.id).forEach((name) =>
                loop.names.add(name),
              )
            }
          }
          visit(head, loop)
        } else if (node.type === 'ForStatement') {
          visit(head, loop)
        } else {
          visitTarget(head, loop)
        }
        visit(node.test, loop)
        visit(node.update, loop)
        visit(node.right, loop)
        visit(node.body, loop)
        return
      }
      case 'SwitchStatement': {
        visit(node.discriminant, scope)
        const cases = createScope(scope, false)
        const switchCases = node.cases as Array<Node>
        declareLexical(
          switchCases.flatMap(
            (switchCase) => switchCase.consequent as Array<Node>,
          ),
          cases,
        )
        for (const switchCase of switchCases) {
          visit(switchCase.test, cases)
          visit(switchCase.consequent, cases)
        }
        return
      }
      case 'CatchClause': {
        const clause = createScope(scope, false)
        patternNames(node.param).forEach((name) => clause.names.add(name))
        visitBinding(node.param, clause)
        visit(node.body, clause)
        return
      }
      case 'VariableDeclaration':
        for (const declarator of node.declarations as Array<Node>) {
          visitBinding(declarator.id, scope)
          visit(declarator.init, scope)
        }
        return
      case 'AssignmentExpression':
        visitTarget(node.left, scope)
        visit(node.right, scope)
        return
      case 'MemberExpression':
        visit(node.object, scope)
        if (node.computed) {
          visit(node.property, scope)
        }
        return
      case 'Property':
        if (node.computed) {
          visit(node.key, scope)
        }
        visit(node.value, scope)
        return
      case 'UnaryExpression':
        if (
          node.operator === 'typeof' &&
          isNode(node.argument) &&
          node.argument.type === 'Identifier'
        ) {
          probed.add(node.argument.name as string)
          // A probed function counts as read: it stays live.
          resolve(node.argument.name as string, scope)
          return
        }
        visit(node.argument, scope)
        return
      case 'LabeledStatement':
        visit(node.body, scope)
        return
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'MetaProperty':
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'PrivateIdentifier':
        return
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          visit(node.declaration, scope)
        } else if (!node.source) {
          for (const specifier of node.specifiers as Array<Node>) {
            visit(specifier.local, scope)
          }
        }
        return
      default:
        for (const [key, value] of Object.entries(node)) {
          if (key !== 'type' && typeof value === 'object') {
            visit(value, scope)
          }
        }
    }
  }

  declareVars(body, moduleScope)
  declareLexical(body, moduleScope)
  for (const statement of body) {
    if (
      statement.type === 'FunctionDeclaration' &&
      isNode(statement.id) &&
      candidates.has(statement.id.name as string)
    ) {
      owner = statement.id.name as string
      visit(statement, moduleScope)
      owner = undefined
    } else if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations as Array<Node>) {
        visitBinding(declarator.id, moduleScope)
        const id = declarator.id as Node
        owner =
          id.type === 'Identifier' && candidates.has(id.name as string)
            ? (id.name as string)
            : undefined
        visit(declarator.init, moduleScope)
        owner = undefined
      }
    } else {
      visit(statement, moduleScope)
    }
  }

  // Live candidates: read by other code, or by a live candidate.
  const live = new Set<string>()
  const pending = [...(reads.get(undefined) ?? [])]
  while (pending.length > 0) {
    const name = pending.pop()!
    if (!live.has(name)) {
      live.add(name)
      pending.push(...(reads.get(name) ?? []))
    }
  }
  const isOnlyInDeadCode = (name: string) =>
    [...(freeOwners.get(name) ?? [undefined])].every(
      (where) => where !== undefined && !live.has(where),
    )
  return { references, probed, isOnlyInDeadCode }
}

/** Unwraps parentheses around an expression. */
function unparenthesized(node: unknown): unknown {
  while (isNode(node) && node.type === 'ParenthesizedExpression') {
    node = node.expression
  }
  return node
}

/**
 * Names of the module-level functions that are dead unless something reads
 * them: unexported `function` declarations, and unexported
 * `const`/`let`/`var` declarators initialised with a function or arrow
 * expression, whose name the module declares exactly once.
 */
function deadCodeCandidates(body: Array<Node>) {
  const counts = new Map<string, number>()
  const count = (name: string) => counts.set(name, (counts.get(name) ?? 0) + 1)
  for (const statement of body) {
    const scope = createScope(undefined, true)
    declareVars([statement], scope)
    declareLexical([statement], scope)
    scope.names.forEach(count)
  }
  const candidates = new Set<string>()
  for (const statement of body) {
    if (statement.type === 'FunctionDeclaration' && isNode(statement.id)) {
      candidates.add(statement.id.name as string)
    } else if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations as Array<Node>) {
        const id = declarator.id as Node
        const init = unparenthesized(declarator.init)
        if (
          id.type === 'Identifier' &&
          isNode(init) &&
          (init.type === 'FunctionExpression' ||
            init.type === 'ArrowFunctionExpression')
        ) {
          candidates.add(id.name as string)
        }
      }
    }
  }
  for (const name of candidates) {
    if (counts.get(name) !== 1) {
      candidates.delete(name)
    }
  }
  return candidates
}
