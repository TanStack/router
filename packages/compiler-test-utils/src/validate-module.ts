/**
 * Dangling names in dead code (user ruling "Dead-code references, widened",
 * 2026-10-17): code that the supported bundlers delete from a production
 * build may read names that are never declared or imported; a dangling name
 * that survives into production output is a bug. So `getModuleErrors`
 * reports only the free names of what real tree-shaking keeps: the module
 * bundled alone by Rolldown (Vite's production bundler) with its exports as
 * roots and every import external (and side-effectful). The build harness
 * checks the production client chunks themselves (`build-harness.ts`).
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { parseSync, transformWithOxc } from 'vite'
import { knownGlobals } from './known-globals'
import type { ESTree, Rolldown } from 'vite'

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
 * ReferenceError when it runs. Known globals (`known-globals.ts`), names
 * the module probes with `typeof`, and `globals` (e.g. the globals the route
 * file itself reads) are allowed, and so are references in code that
 * tree-shaking deletes (see the top of this file).
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
  const compiled = await compileModule(code, filename)
  let names = [...freeNamesOf(compiled)].filter((name) => !allowed.has(name))
  // Tree-shaking only deletes code, so it runs only when there is a name to
  // clear.
  if (names.length > 0) {
    let kept: Set<string>
    try {
      kept = freeNamesOf(await treeShake(compiled))
    } catch (error) {
      return [stripVTControlCharacters((error as Error).message)]
    }
    names = names.filter((name) => kept.has(name))
  }
  return names.map(
    (name) => `\`${name}\` is referenced but never declared or imported`,
  )
}

/**
 * Names a module references without declaring or importing them, other than
 * known globals and names it probes with `typeof`, once TypeScript is erased
 * and JSX compiled with the project default (React's automatic runtime) or
 * the module's own JSX pragmas (a `@jsx` or `@jsxFrag` pragma alone selects
 * the classic runtime, see `jsxRuntime`). Dead code counts too.
 */
export async function freeIdentifiers(
  code: string,
  filename = 'module.tsx',
): Promise<Set<string>> {
  return freeNamesOf(await compileModule(code, filename))
}

/**
 * Names a JavaScript module (e.g. a bundler's output chunk) reads without
 * declaring or importing them, other than the names it probes with `typeof`.
 * Globals count: the caller decides which names exist at run time.
 */
export function unboundNames(javascript: string): Set<string> {
  const { program } = parseSync('module.js', javascript, {
    sourceType: 'module',
  })
  const { references, probed } = analyzeScopes(program)
  return new Set([...references].filter((name) => !probed.has(name)))
}

/** The module with TypeScript erased and JSX compiled (see `jsxRuntime`). */
async function compileModule(code: string, filename: string) {
  const { code: javascript } = await transformWithOxc(code, filename, {
    jsx: { runtime: jsxRuntime(code, filename) },
    typescript: { onlyRemoveTypeImports: true },
  })
  return javascript
}

function freeNamesOf(javascript: string): Set<string> {
  return new Set(
    [...unboundNames(javascript)].filter((name) => !knownGlobals.has(name)),
  )
}

const require = createRequire(import.meta.url)
let rolldownModule: Promise<typeof Rolldown> | undefined

/** The Rolldown that Vite builds with (a dependency of Vite, not ours). */
function loadRolldown(): Promise<typeof Rolldown> {
  rolldownModule ??= import(
    pathToFileURL(createRequire(require.resolve('vite')).resolve('rolldown'))
      .href
  ) as Promise<typeof Rolldown>
  return rolldownModule
}

const entryId = '\0validate-module-entry'

/**
 * What Rolldown keeps of a JavaScript module bundled alone, tree-shaking on,
 * its exports kept: every import stays external, and external modules count
 * as side-effectful. `platform: 'neutral'` defines nothing (no
 * `process.env.NODE_ENV`), since the module may run on the client or the
 * server.
 */
async function treeShake(javascript: string): Promise<string> {
  const { rolldown } = await loadRolldown()
  const bundle = await rolldown({
    input: entryId,
    platform: 'neutral',
    treeshake: true,
    logLevel: 'silent',
    external: (id) => id !== entryId,
    plugins: [
      {
        name: 'validate-module-entry',
        resolveId: (id) => (id === entryId ? id : null),
        load: (id) => (id === entryId ? javascript : null),
      },
    ],
  })
  try {
    const { output } = await bundle.generate({ format: 'esm' })
    return output
      .map((item) => (item.type === 'chunk' ? item.code : ''))
      .join('\n')
  } finally {
    await bundle.close()
  }
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

  const reference = (name: string, scope: Scope) => {
    for (
      let current: Scope | undefined = scope;
      current;
      current = current.parent
    ) {
      if (current.names.has(name)) {
        return
      }
    }
    references.add(name)
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
  visitBody(body, moduleScope)
  return { references, probed }
}
