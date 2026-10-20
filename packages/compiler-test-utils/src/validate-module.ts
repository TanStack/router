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
 * The JSX settings of the project a module belongs to: what its bundler's JSX
 * transform starts from before it reads the module's own pragmas
 * (`@jsxRuntime`, `@jsxImportSource`, `@jsx`, `@jsxFrag`). React's automatic
 * runtime by default, as `@vitejs/plugin-react` and Rsbuild's
 * `pluginReact()` configure it.
 */
export interface ProjectJsx {
  /** Default `automatic`. */
  runtime?: 'automatic' | 'classic'
  /** Automatic runtime: the module of `jsx-runtime` (default `react`). */
  importSource?: string
  /** Classic runtime: the element factory (default `React.createElement`). */
  pragma?: string
  /** Classic runtime: the fragment (default `React.Fragment`). */
  pragmaFrag?: string
}

export interface ModuleErrorOptions {
  /** Names the module may read as globals besides the known ones. */
  globals?: Iterable<string>
  /** The JSX settings of the module's project (see `ProjectJsx`). */
  jsx?: ProjectJsx
  /**
   * The source module the checked module was compiled from (same language
   * as `filename`). Names the source itself reads without declaring them
   * are allowed. A name the source declares, imports or binds as a
   * parameter, but that the compiled module reads without a binding and the
   * source never reads without one, is a lost local binding: an error even
   * when a global has that name (e.g. a dropped `const status` whose reads
   * now read `window.status`).
   */
  source?: string
}

/**
 * Validates generated code the way a browser or bundler sees it, without using
 * the compiler's own parser: erase TypeScript (keeping every value import) and
 * parse the result as a JavaScript module with semantic checks. This rejects
 * syntax errors, nameless function/class declarations, duplicate bindings
 * (including an import redeclared by a local declaration) and exports of
 * undeclared bindings.
 *
 * It also rejects references to names that are neither declared nor imported
 * in the module, once JSX is compiled the way the project's bundler compiles
 * it: by Oxc (Vite's transform) with the project's JSX settings (`jsx`),
 * which applies the module's own pragmas where it honours them, so a classic
 * factory or fragment is read like any other name. Such a reference throws a
 * ReferenceError when it runs. Globals of the browser and of Node.js
 * (`known-globals.ts`), reads a `typeof` check guards (see `unboundNames`),
 * `globals` and the names the `source` reads itself are allowed, and so are
 * references in code that tree-shaking deletes (see the top of this file).
 * With a `source`, a lost local binding is an error (see `source`).
 *
 * @returns the error messages; an empty array means the module is valid.
 */
export async function getModuleErrors(
  code: string,
  filename = 'module.tsx',
  options: ModuleErrorOptions = {},
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
  /** Names the source binds but never reads without a binding. */
  const lost = new Set<string>()
  if (options.source !== undefined) {
    let source: string
    try {
      source = await compileModule(options.source, filename, options.jsx)
    } catch (error) {
      throw new Error(
        `the source module is invalid: ${stripVTControlCharacters((error as Error).message)}`,
      )
    }
    const sourceReads = unboundNames(source)
    sourceReads.forEach((name) => allowed.add(name))
    for (const name of boundNames(source)) {
      if (!sourceReads.has(name)) {
        lost.add(name)
      }
    }
  }
  const compiled = await compileModule(code, filename, options.jsx)
  let names = [...unboundNames(compiled)].filter(
    (name) => lost.has(name) || !(knownGlobals.has(name) || allowed.has(name)),
  )
  // Tree-shaking only deletes code, so it runs only when there is a name to
  // clear.
  if (names.length > 0) {
    let kept: Set<string>
    try {
      kept = unboundNames(await treeShake(compiled))
    } catch (error) {
      return [stripVTControlCharacters((error as Error).message)]
    }
    names = names.filter((name) => kept.has(name))
  }
  return names.map((name) =>
    lost.has(name)
      ? `\`${name}\` is bound in the source module, but read here without a binding`
      : `\`${name}\` is referenced but never declared or imported`,
  )
}

/**
 * Names a module references without declaring or importing them, other than
 * known globals and reads a `typeof` check guards, once TypeScript is erased
 * and JSX compiled with the project's JSX settings (`jsx`, see `ProjectJsx`)
 * and the module's own pragmas. Dead code counts too.
 */
export async function freeIdentifiers(
  code: string,
  filename = 'module.tsx',
  options: { jsx?: ProjectJsx } = {},
): Promise<Set<string>> {
  return freeNamesOf(await compileModule(code, filename, options.jsx))
}

/**
 * Names a JavaScript module (e.g. a bundler's output chunk) reads without
 * declaring or importing them. Globals count: the caller decides which names
 * exist at run time. Reads that cannot throw a ReferenceError do not count:
 * `typeof x` itself, and a read that a `typeof` check of the name guards (the
 * right side of `typeof x !== 'undefined' && x`, the branch of a `?:` or an
 * `if` the check selects when `x` exists, and the right side of `||` after a
 * check that `x` does not exist). Another read of the same name, e.g. in
 * another function, still counts.
 */
export function unboundNames(javascript: string): Set<string> {
  return new Set(unboundReads(javascript).keys())
}

/**
 * The reads `unboundNames` reports, by name: the offset in `javascript` of
 * each unguarded read of the name.
 */
export function unboundReads(javascript: string): Map<string, Array<number>> {
  return nameReads(javascript).unbound
}

/**
 * The names a JavaScript module reads: `bound`, those of which a read
 * resolves to a binding of the module; `unbound`, those `unboundReads`
 * reports.
 */
export function nameReads(javascript: string): {
  bound: Set<string>
  unbound: Map<string, Array<number>>
} {
  const { program } = parseSync('module.js', javascript, {
    sourceType: 'module',
  })
  return analyzeScopes(program)
}

/**
 * The module with TypeScript erased and JSX compiled by Oxc from the
 * project's JSX settings; Oxc applies the module's own pragmas over them.
 */
async function compileModule(
  code: string,
  filename: string,
  jsx: ProjectJsx = {},
) {
  const { code: javascript } = await transformWithOxc(code, filename, {
    jsx: {
      runtime: jsx.runtime ?? 'automatic',
      importSource: jsx.importSource ?? 'react',
      ...(jsx.pragma !== undefined && { pragma: jsx.pragma }),
      ...(jsx.pragmaFrag !== undefined && { pragmaFrag: jsx.pragmaFrag }),
    },
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
 * The modules a compiled module's dynamic `import()`s name (static
 * specifiers) that survive a real production bundler: Rolldown, Vite's
 * bundler, bundling the module alone with tree-shaking on and its exports
 * kept (`treeShake`). An `import()` in code that bundler deletes (e.g. in a
 * function nothing calls) is no load; one in code it keeps is. TypeScript
 * and JSX are compiled first, from `filename`'s language and `jsx` (default:
 * React's automatic runtime).
 */
export async function keptDynamicImports(
  code: string,
  options: { filename?: string; jsx?: ProjectJsx } = {},
): Promise<Array<string>> {
  const compiled = await compileModule(
    code,
    options.filename ?? 'module.tsx',
    options.jsx,
  )
  // Rolldown rewrites relative external specifiers: each static one becomes
  // a bare placeholder it keeps as is, named back afterwards.
  const targets: Array<string> = []
  const marked = replaceStaticDynamicImports(compiled, (specifier) => {
    targets.push(specifier)
    return JSON.stringify(`${keptPlaceholder}${targets.length - 1}`)
  })
  const kept = new Set<string>()
  replaceStaticDynamicImports(await treeShake(marked), (specifier) => {
    if (specifier.startsWith(keptPlaceholder)) {
      const target = targets[Number(specifier.slice(keptPlaceholder.length))]
      if (target !== undefined) {
        kept.add(target)
      }
    }
    return undefined
  })
  return [...kept]
}

const keptPlaceholder = 'validate-module-dynamic-import:'

/**
 * Replaces each dynamic `import()` specifier of `javascript` that is a
 * string literal (or a template literal without substitutions) with the
 * code `replace` returns for its value, when it returns some.
 */
function replaceStaticDynamicImports(
  javascript: string,
  replace: (specifier: string) => string | undefined,
) {
  const { module } = parseSync('module.js', javascript, {
    sourceType: 'module',
  })
  let result = javascript
  for (const { moduleRequest } of [...module.dynamicImports].reverse()) {
    const literal = /^(["'`])([^"'`\\$]*)\1$/.exec(
      javascript.slice(moduleRequest.start, moduleRequest.end),
    )
    const replacement = literal ? replace(literal[2]!) : undefined
    if (replacement !== undefined) {
      result =
        result.slice(0, moduleRequest.start) +
        replacement +
        result.slice(moduleRequest.end)
    }
  }
  return result
}

/**
 * Names a JavaScript module binds anywhere: imports, variables, functions,
 * classes, parameters and catch parameters.
 */
function boundNames(javascript: string): Set<string> {
  const { program } = parseSync('module.js', javascript, {
    sourceType: 'module',
  })
  const names = new Set<string>()
  const add = (pattern: unknown) =>
    patternNames(pattern).forEach((name) => names.add(name))
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!isNode(node)) {
      return
    }
    switch (node.type) {
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
        add(node.local)
        break
      case 'VariableDeclarator':
        add(node.id)
        break
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        add(node.id)
        ;(node.params as Array<Node>).forEach(add)
        break
      case 'ClassDeclaration':
      case 'ClassExpression':
        add(node.id)
        break
      case 'CatchClause':
        add(node.param)
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
  /** Free names a `typeof` check proved to exist in this scope. */
  guarded?: Set<string>
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

const noGuard = () => ({
  whenTrue: new Set<string>(),
  whenFalse: new Set<string>(),
})

/** `node` without the parentheses around it. */
function unparenthesized(node: unknown): unknown {
  let current = node
  while (isNode(current) && current.type === 'ParenthesizedExpression') {
    current = current.expression
  }
  return current
}

/**
 * The free names a condition proves to exist when it is true (`whenTrue`)
 * and when it is false (`whenFalse`), through `typeof` checks:
 * `typeof x !== 'undefined'`, `typeof x === 'function'`, their negations and
 * the minified forms `typeof x < 'u'` and `typeof x > 'u'`, combined with
 * `!`, `&&` and `||`, or last in a comma sequence.
 */
function typeofGuard(condition: unknown): {
  whenTrue: Set<string>
  whenFalse: Set<string>
} {
  const node = unparenthesized(condition)
  if (!isNode(node)) {
    return noGuard()
  }
  if (node.type === 'UnaryExpression' && node.operator === '!') {
    const inner = typeofGuard(node.argument)
    return { whenTrue: inner.whenFalse, whenFalse: inner.whenTrue }
  }
  // Minifiers fold statements into the condition: `if ((a(), check))`
  if (node.type === 'SequenceExpression') {
    return typeofGuard((node.expressions as Array<Node>).at(-1))
  }
  if (node.type === 'LogicalExpression') {
    const left = typeofGuard(node.left)
    const right = typeofGuard(node.right)
    const union = (a: Set<string>, b: Set<string>) => new Set([...a, ...b])
    const both = (a: Set<string>, b: Set<string>) =>
      new Set([...a].filter((name) => b.has(name)))
    if (node.operator === '&&') {
      return {
        whenTrue: union(left.whenTrue, right.whenTrue),
        whenFalse: both(left.whenFalse, right.whenFalse),
      }
    }
    if (node.operator === '||') {
      return {
        whenTrue: both(left.whenTrue, right.whenTrue),
        whenFalse: union(left.whenFalse, right.whenFalse),
      }
    }
    return noGuard()
  }
  if (node.type !== 'BinaryExpression') {
    return noGuard()
  }
  const typeofName = (side: unknown) => {
    const operand = unparenthesized(side)
    return isNode(operand) &&
      operand.type === 'UnaryExpression' &&
      operand.operator === 'typeof' &&
      isNode(operand.argument) &&
      operand.argument.type === 'Identifier'
      ? (operand.argument.name as string)
      : undefined
  }
  // A string literal, or a template literal without substitutions (Vite's
  // minifier prints `typeof x<\`u\``).
  const text = (side: unknown) => {
    const literal = unparenthesized(side)
    if (!isNode(literal)) {
      return undefined
    }
    if (literal.type === 'Literal') {
      return typeof literal.value === 'string' ? literal.value : undefined
    }
    const quasis = literal.quasis as Array<Node> | undefined
    return literal.type === 'TemplateLiteral' && quasis?.length === 1
      ? ((quasis[0]!.value as { cooked?: string }).cooked ?? undefined)
      : undefined
  }
  let name = typeofName(node.left)
  let value = text(node.right)
  let operator = node.operator as string
  if (name === undefined) {
    // `'undefined' !== typeof x`; `'u' > typeof x` is `typeof x < 'u'`
    name = typeofName(node.right)
    value = text(node.left)
    operator = operator === '<' ? '>' : operator === '>' ? '<' : operator
  }
  if (name === undefined || value === undefined) {
    return noGuard()
  }
  const exists = new Set([name])
  const isTrueWhenDefined =
    operator === '===' || operator === '=='
      ? value !== 'undefined'
      : operator === '!==' || operator === '!='
        ? value === 'undefined'
        : // Every result of `typeof` but 'undefined' sorts before 'u'
          operator === '<' && value === 'u'
          ? true
          : operator === '>' && value === 'u'
            ? false
            : undefined
  if (isTrueWhenDefined === undefined) {
    return noGuard()
  }
  return isTrueWhenDefined
    ? { whenTrue: exists, whenFalse: new Set() }
    : { whenTrue: new Set(), whenFalse: exists }
}

/** Whether a statement always leaves the statement list it is in. */
function exits(statement: unknown): boolean {
  if (!isNode(statement)) {
    return false
  }
  switch (statement.type) {
    case 'ReturnStatement':
    case 'ThrowStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return true
    case 'BlockStatement':
      return exits((statement.body as Array<Node>).at(-1))
  }
  return false
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

/** A function of the program, and the function its code runs in. */
interface FunctionInfo {
  enclosing: FunctionInfo | undefined
  /** The binding the function is declared as or assigned to, if any. */
  binding?: Binding
}

/** Where the program reads a binding: in `scope`, in the code of `fn`. */
interface Binding {
  reads: Array<{ scope: Scope; fn: FunctionInfo | undefined }>
}

/**
 * Walks a program and returns the names it references without a declaration
 * in scope, other than `typeof` operands and reads a `typeof` check guards
 * (see `unboundNames`). A read also counts as guarded in a function that
 * only guarded code can call: a function whose binding is only read where
 * the check guards (e.g. passed to `setTimeout()` in the guarded branch),
 * or that is created in such a function.
 */
function analyzeScopes(program: ESTree.Program) {
  const moduleScope = createScope(undefined, true)
  const body = program.body as unknown as Array<Node>
  /** Reads of free names the checks around them do not guard. */
  const unguarded: Array<{
    name: string
    fn: FunctionInfo | undefined
    start: number
  }> = []
  /** Names the program checks with `typeof`. */
  const checked = new Set<string>()
  /** Names of which a read resolves to a binding. */
  const bound = new Set<string>()
  const bindings = new Map<Scope, Map<string, Binding>>()
  let currentFunction: FunctionInfo | undefined
  /** Bindings function expressions are assigned to (`const f = () => {}`). */
  const functionBindings = new Map<Node, Binding>()

  const declaringScope = (name: string, scope: Scope) => {
    for (
      let current: Scope | undefined = scope;
      current;
      current = current.parent
    ) {
      if (current.names.has(name)) {
        return current
      }
    }
    return undefined
  }

  const bindingOf = (scope: Scope, name: string) => {
    let byName = bindings.get(scope)
    if (!byName) {
      byName = new Map()
      bindings.set(scope, byName)
    }
    let binding = byName.get(name)
    if (!binding) {
      binding = { reads: [] }
      byName.set(name, binding)
    }
    return binding
  }

  const reference = (name: string, scope: Scope, start: number) => {
    for (
      let current: Scope | undefined = scope;
      current;
      current = current.parent
    ) {
      if (current.names.has(name)) {
        bindingOf(current, name).reads.push({ scope, fn: currentFunction })
        bound.add(name)
        return
      }
      if (current.guarded?.has(name)) {
        return
      }
    }
    unguarded.push({ name, fn: currentFunction, start })
  }

  /** Whether a check of `name` guards code in `scope`. */
  const guardedIn = (scope: Scope, name: string) => {
    for (
      let current: Scope | undefined = scope;
      current;
      current = current.parent
    ) {
      if (current.guarded?.has(name)) {
        return true
      }
    }
    return false
  }

  /**
   * Whether the code of `fn` only runs where `name` exists: `fn` is created
   * in such a function, or only code where it exists reads its binding.
   * Functions that read each other count as guarded unless code outside
   * reaches them (the greatest solution), so a result found while assuming
   * another function guarded is only kept when it is `false`.
   */
  const assumed = new Set<FunctionInfo>()
  const guardedFunctions = new Map<string, Map<FunctionInfo, boolean>>()
  const isGuardedFunction = (
    fn: FunctionInfo | undefined,
    name: string,
  ): boolean => {
    if (!fn) {
      return false
    }
    let known = guardedFunctions.get(name)
    if (!known) {
      known = new Map()
      guardedFunctions.set(name, known)
    }
    const found = known.get(fn)
    if (found !== undefined) {
      return found
    }
    if (assumed.has(fn)) {
      return true
    }
    const outermost = assumed.size === 0
    assumed.add(fn)
    const result =
      isGuardedFunction(fn.enclosing, name) ||
      (fn.binding !== undefined &&
        fn.binding.reads.every(
          (read) =>
            guardedIn(read.scope, name) || isGuardedFunction(read.fn, name),
        ))
    assumed.delete(fn)
    if (!result || outermost) {
      known.set(fn, result)
    }
    return result
  }

  /** Code outside the module may read what it exports. */
  const exportBindings = (declaration: Node | null | undefined) => {
    if (!declaration) {
      return
    }
    const names =
      declaration.type === 'VariableDeclaration'
        ? (declaration.declarations as Array<Node>).flatMap((declarator) =>
            patternNames(declarator.id),
          )
        : isNode(declaration.id)
          ? [declaration.id.name as string]
          : []
    for (const name of names) {
      if (moduleScope.names.has(name)) {
        bindingOf(moduleScope, name).reads.push({
          scope: moduleScope,
          fn: undefined,
        })
      }
    }
  }

  /** `scope`, where a `typeof` check proved the `guarded` names exist. */
  const guardedScope = (scope: Scope, guarded: Set<string>) => {
    if (guarded.size === 0) {
      return scope
    }
    const inner = createScope(scope, false)
    inner.guarded = guarded
    return inner
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

  /**
   * Visits a statement list. After `if (typeof x === 'undefined') return`,
   * the statements that follow run only where `x` exists. Function
   * declarations among them are hoisted, so they are not guarded by
   * position (only by who reads them).
   */
  const visitBody = (statements: Array<Node>, scope: Scope) => {
    declareLexical(statements, scope)
    let current = scope
    for (const statement of statements) {
      const declaration =
        statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportDefaultDeclaration'
          ? (statement.declaration as Node | null)
          : statement
      visit(
        statement,
        declaration?.type === 'FunctionDeclaration' ? scope : current,
      )
      if (
        statement.type === 'IfStatement' &&
        !statement.alternate &&
        exits(statement.consequent)
      ) {
        current = guardedScope(current, typeofGuard(statement.test).whenFalse)
      }
    }
  }

  const visitFunction = (node: Node, outer: Scope) => {
    const declared =
      node.type === 'FunctionDeclaration' && isNode(node.id)
        ? declaringScope(node.id.name as string, outer)
        : undefined
    const info: FunctionInfo = {
      enclosing: currentFunction,
      binding: declared
        ? bindingOf(declared, (node.id as Node).name as string)
        : functionBindings.get(node),
    }
    const enclosing = currentFunction
    currentFunction = info
    try {
      visitFunctionBody(node, outer)
    } finally {
      currentFunction = enclosing
    }
  }

  const visitFunctionBody = (node: Node, outer: Scope) => {
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
        reference(node.name as string, scope, node.start as number)
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
          const init = unparenthesized(declarator.init)
          const id = declarator.id as Node
          if (
            isNode(init) &&
            functionTypes.has(init.type) &&
            id.type === 'Identifier'
          ) {
            const declared = declaringScope(id.name as string, scope)
            if (declared) {
              functionBindings.set(init, bindingOf(declared, id.name as string))
            }
          }
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
        // `typeof x` never throws, even when nothing declares `x`
        if (
          node.operator === 'typeof' &&
          isNode(node.argument) &&
          node.argument.type === 'Identifier'
        ) {
          checked.add(node.argument.name as string)
          return
        }
        visit(node.argument, scope)
        return
      case 'LogicalExpression': {
        visit(node.left, scope)
        const guard = typeofGuard(node.left)
        visit(
          node.right,
          node.operator === '&&'
            ? guardedScope(scope, guard.whenTrue)
            : node.operator === '||'
              ? guardedScope(scope, guard.whenFalse)
              : scope,
        )
        return
      }
      case 'ConditionalExpression':
      case 'IfStatement': {
        visit(node.test, scope)
        const guard = typeofGuard(node.test)
        visit(node.consequent, guardedScope(scope, guard.whenTrue))
        visit(node.alternate, guardedScope(scope, guard.whenFalse))
        return
      }
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
      case 'ExportDefaultDeclaration':
        visit(node.declaration, scope)
        exportBindings(node.declaration as Node)
        return
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          visit(node.declaration, scope)
          exportBindings(node.declaration as Node)
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
  const unbound = new Map<string, Array<number>>()
  for (const read of unguarded) {
    if (!(checked.has(read.name) && isGuardedFunction(read.fn, read.name))) {
      const starts = unbound.get(read.name) ?? []
      starts.push(read.start)
      unbound.set(read.name, starts)
    }
  }
  return { bound, unbound }
}
