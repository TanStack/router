/**
 * Purity model: literals, function/class expressions without
 * decorators/static effects, pure object/array literals, all-literal
 * templates, `/*#__PURE__*\/` calls with pure arguments, calls with pure
 * arguments of `#__NO_SIDE_EFFECTS__` callee declarations and of the pure
 * exports of known packages (`RecognizerTable.pureCalls`: by import
 * binding, namespace member or a member of a default import that is the
 * package's namespace, `pureDefaultNamespaces`; re-exports are not followed), JSX with bound/intrinsic tags and
 * pure attributes and children, and a member of a module namespace import (`ns.x`: its [[Get]]
 * reads the module's binding and runs no code, as an imported identifier does) or of a
 * plain enum of the module (`isPlainEnum`; a property of any other object may be a getter).
 * `import()` is impure. The same classification yields the module's own effects at statement granularity (`ModuleAnalysis.effects()`).
 */
import { BindingFlags, walk } from 'yuku'
import { unwrapExpression } from './source'
import { ownEntry } from './strings'
import type {
  Binding,
  Comment,
  Expression,
  Node,
  SourceFile,
  Statement,
  VariableDeclarator,
} from 'yuku'

export interface PurityContext {
  file: SourceFile
  /** Comments sorted by start (the file's). */
  comments: ReadonlyArray<Comment>
  /**
   * Bindings (ids) of callees whose calls are pure when their arguments are:
   * declared with `#__NO_SIDE_EFFECTS__`, or imports of a pure export of a
   * known package.
   */
  noSideEffectCallees: ReadonlySet<number>
  /** Namespace imports (binding ids) of known packages, and default imports that are their namespace (`pureDefaultNamespaces`) → their pure exports. */
  pureNamespaces: ReadonlyMap<number, ReadonlySet<string>>
  /** Value namespace imports (binding ids): `import * as ns from '…'`. */
  namespaceImports: ReadonlySet<number>
  /**
   * Builder chains whose calls are no effect in one environment
   * (`RecognizerTable.builderLinks`): on the contexts of the
   * per-environment code effects of raw facts (`ModuleAnalysis.effects()`)
   * and on the planners' of a compile, for its environment type
   * (`ModuleAnalysisOptions.env`).
   */
  builders?: BuilderPurity
  /**
   * Rule L (`languagePurity`): language operations are no effect. Set on
   * the purity placement judges effects with (`ModuleAnalysis.effectPurity`),
   * never on the one that decides what may be deleted.
   */
  language?: boolean
}

/**
 * The purity placement judges a top-level evaluation's effects with (rule
 * L): `ctx`, and a member read, a spread, `in` and `instanceof`, a call or
 * `new` of a standard global (`Object.keys`, `new Set`, `Math.max`,
 * `JSON.stringify`, `new Intl.NumberFormat`, …) and a method of the value
 * one returns or of a literal (`Object.entries(x).map(f)`, `'a,b'.split()`),
 * with pure arguments, are no effect. A function such a call is handed runs
 * there: an inline one's calls must be language operations too, a named one
 * of the module is judged so, an imported one is an effect. Getters,
 * proxies, iterators and `toString` stay outside the model, as for reads
 * (R97): the language defines what these operations do, a library does not.
 * Only placement's timing takes it: `effects()` (a module's effects as a
 * target) still counts every operation that may run code.
 */
export function languagePurity(ctx: PurityContext): PurityContext {
  return { ...ctx, language: true }
}

/** The standard globals whose calls (`Number(x)`) are language operations. */
const LANGUAGE_FUNCTIONS = new Set([
  'Array',
  'BigInt',
  'Boolean',
  'Number',
  'Object',
  'String',
  'Symbol',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'isFinite',
  'isNaN',
  'parseFloat',
  'parseInt',
  'structuredClone',
])
/** The standard constructors whose `new` is a language operation. */
const LANGUAGE_CONSTRUCTORS = new Set([
  'Array',
  'Date',
  'Error',
  'Map',
  'Object',
  'RegExp',
  'Set',
  'URL',
  'URLSearchParams',
  'WeakMap',
  'WeakSet',
])
/** The standard namespaces and constructors whose statics (`Object.keys`) are language operations: all of them (`true`), or these. */
const LANGUAGE_STATICS = new Map<string, ReadonlySet<string> | true>([
  [
    'Object',
    new Set([
      'create',
      'entries',
      'freeze',
      'fromEntries',
      'getOwnPropertyNames',
      'keys',
      'values',
    ]),
  ],
  ['Array', new Set(['from', 'isArray', 'of'])],
  ['Date', new Set(['UTC', 'now', 'parse'])],
  ['Symbol', new Set(['for'])],
  ['Intl', true],
  ['JSON', true],
  ['Math', true],
  ['Number', true],
  ['String', true],
])

/** Whether an identifier names a global (no binding of the module or of a scope around it). */
function isGlobal(ctx: PurityContext, id: Node): boolean {
  return ctx.file.referenceOf(id)?.binding === null
}

/** Whether calling (or `new` of) `callee` is a language operation, its arguments aside (rule L). */
function languageCallee(
  ctx: PurityContext,
  callee: Node,
  isNew: boolean,
): boolean {
  const c = unwrapExpression(callee)
  if (c.type === 'Identifier') {
    return (
      isGlobal(ctx, c) &&
      (isNew ? LANGUAGE_CONSTRUCTORS : LANGUAGE_FUNCTIONS).has(c.name)
    )
  }
  if (c.type !== 'MemberExpression') {
    return false
  }
  const object = unwrapExpression(c.object as Node)
  if (object.type === 'Identifier' && isGlobal(ctx, object)) {
    const statics = LANGUAGE_STATICS.get(object.name)
    const name =
      !c.computed && c.property.type === 'Identifier' ? c.property.name : null
    return (
      statics === true ||
      (statics !== undefined && name !== null && statics.has(name))
    )
  }
  // a method of a value the language made: a literal, or what a language
  // operation returns (`Object.entries(x).map`, `new Set(a).has`)
  if (isNew) {
    return false
  }
  switch (object.type) {
    case 'ArrayExpression':
    case 'ObjectExpression':
    case 'Literal':
    case 'TemplateLiteral':
      return true
    case 'CallExpression':
    case 'NewExpression':
      return languageCallee(ctx, object.callee, object.type === 'NewExpression')
    default:
      return false
  }
}

/**
 * A function a language operation is handed, which it may call: an inline
 * one whose body only calls language operations (or calls the model takes
 * as pure), and creates no module; a named one, if a function of the module
 * (`follow`: judged so) or not a function the module declares. An import
 * may be any function: an effect.
 */
function languageCallback(
  ctx: PurityContext,
  arg: Node,
  follow: boolean,
): boolean {
  const a = unwrapExpression(arg)
  if (a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression') {
    return languageBody(ctx, a)
  }
  if (a.type !== 'Identifier') {
    return true
  }
  const b = ctx.file.referenceOf(a)?.binding
  if (b === undefined || b === null) {
    return true
  }
  if (b.has(BindingFlags.Import)) {
    return false
  }
  if (b.scope !== ctx.file.rootScope) {
    return true
  }
  const decl = b.declarations[0]
  const parent = decl === undefined ? null : ctx.file.parentOf(decl)
  const fn =
    parent?.type === 'FunctionDeclaration'
      ? parent
      : parent?.type === 'VariableDeclarator' && parent.init !== null
        ? unwrapExpression(parent.init)
        : null
  if (
    fn === null ||
    (fn.type !== 'FunctionDeclaration' &&
      fn.type !== 'ArrowFunctionExpression' &&
      fn.type !== 'FunctionExpression')
  ) {
    return true
  }
  return follow && languageBody(ctx, fn)
}

/** Whether every call a function's body makes is a language operation or one the model takes as pure (rule L: what a language operation it is handed runs). */
function languageBody(ctx: PurityContext, fn: Node): boolean {
  let pure = true
  walk(fn, {
    enter: (n, w) => {
      if (!pure) {
        w.stop()
        return
      }
      switch (n.type) {
        case 'CallExpression':
        case 'NewExpression':
          pure =
            hasPureAnnotation(ctx, n) ||
            (n.type === 'CallExpression' &&
              isPureCallee(ctx, unwrapExpression(n.callee))) ||
            (languageCallee(ctx, n.callee, n.type === 'NewExpression') &&
              n.arguments.every((a) =>
                languageCallback(
                  ctx,
                  a.type === 'SpreadElement' ? a.argument : a,
                  false,
                ),
              ))
          break
        case 'TaggedTemplateExpression':
          pure = languageCallee(ctx, n.tag, false)
          break
        case 'ImportExpression':
          pure = false
          break
        case 'ClassExpression':
        case 'ClassDeclaration':
          pure = isPureClass(ctx, n)
          break
        case 'JSXElement':
          pure = isPureJsxTag(ctx, n.openingElement.name)
          break
      }
    },
  })
  return pure
}

/** A call or `new` that is a language operation with pure arguments, each function it is handed judged as it may run (rule L). */
function isLanguageCall(
  ctx: PurityContext,
  node: Extract<Node, { type: 'CallExpression' | 'NewExpression' }>,
): boolean {
  const callee = unwrapExpression(node.callee)
  return (
    languageCallee(ctx, callee, node.type === 'NewExpression') &&
    // (a method's receiver is evaluated: `[f()].map(g)`)
    (callee.type !== 'MemberExpression' || isPureExpression(ctx, callee)) &&
    node.arguments.every((a) => {
      const arg = a.type === 'SpreadElement' ? a.argument : a
      const f = unwrapExpression(arg)
      return f.type === 'ArrowFunctionExpression' ||
        f.type === 'FunctionExpression' ||
        f.type === 'Identifier'
        ? languageCallback(ctx, arg, true)
        : isPureExpression(ctx, arg)
    })
  )
}

/** The builder chains `isPureExpression` takes as pure in one environment (`PurityContext.builders`). */
export interface BuilderPurity {
  env: 'client' | 'server'
  /** Kind → link method → the environment keeping its argument (`RecognizerTable.builderLinks`). */
  links: Readonly<Record<string, Record<string, 'client' | 'server' | 'both'>>>
  /** Env-only kind → the environment keeping its argument (`RecognizerTable.envOnlyKinds`). */
  envOnly: Readonly<Record<string, 'client' | 'server'>>
  /** The kinds whose links write their receiver (`RecognizerTable.builderLinksWrite`). */
  writes: ReadonlySet<string>
  /**
   * Local names of imports of known packages' chain factories → the import's
   * binding and the kind. A callee of that name is the factory when it
   * refers to that binding (a function body may declare the name again).
   */
  factories: ReadonlyMap<string, { binding: number; kind: string }>
  /** Local names of namespace imports of known packages → the import's binding and its factory exports → kind. */
  namespaces: ReadonlyMap<
    string,
    { binding: number; factories: Readonly<Record<string, string>> }
  >
  /** Kind → the terminal value its builder reaches (`RecognizerTable.terminal`): `serverFn` ends at `.handler()`. */
  terminal: Readonly<Record<string, string>>
  /** Names of the module-level `const`s declared so far whose value is an open chain's builder → kind. */
  locals: Map<string, string>
  /** The arguments the environment's compile erases, as the checks met them (their reads are erased with them). */
  erased: Array<{ start: number; end: number }>
}

/** A builder chain's call that is no effect (`builderCall`): its kind, and whether links may follow (`.handler()` ends a server fn's). */
export interface BuilderCall {
  kind: string
  open: boolean
}

const PURE_RE = /[@#]__PURE__/
const NSE_RE = /[@#]__NO_SIDE_EFFECTS__/

/** The comment ending right before `offset` (only whitespace between), if any. */
function commentBefore(
  comments: ReadonlyArray<Comment>,
  code: string,
  offset: number,
): Comment | null {
  // binary search the last comment with end <= offset
  let lo = 0
  let hi = comments.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (comments[mid]!.end <= offset) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (found === -1) {
    return null
  }
  const c = comments[found]!
  for (let i = c.end; i < offset; i++) {
    const ch = code.charCodeAt(i)
    if (ch !== 32 && ch !== 9 && ch !== 10 && ch !== 13) {
      return null
    }
  }
  return c
}

/**
 * Marks the module's own `#__NO_SIDE_EFFECTS__` callees (a function
 * declaration, `const f = /* #__NO_SIDE_EFFECTS__ *\/ () => …`,
 * `/* #__NO_SIDE_EFFECTS__ *\/ const f = () => …`, exported or not: the
 * placements Rollup and esbuild both accept) before any statement is
 * classified: a function declaration is
 * hoisted, so a call may precede it, and Tier 0 and the unit model must
 * classify the same statement alike. The one seeding of local callees.
 */
export function seedNoSideEffectDeclarations(
  ctx: PurityContext,
  callees: Set<number>,
  body: ReadonlyArray<Node>,
): void {
  if (!ctx.comments.some((c) => NSE_RE.test(c.value))) {
    return
  }
  const mark = (id: Node) => {
    const b = id.type === 'Identifier' ? ctx.file.rootScope.find(id.name) : null
    if (b) {
      callees.add(b.id)
    }
  }
  for (const stmt of body) {
    const decl =
      stmt.type === 'ExportNamedDeclaration' ||
      stmt.type === 'ExportDefaultDeclaration'
        ? stmt.declaration
        : stmt
    if (!decl) {
      continue
    }
    if (decl.type === 'FunctionDeclaration' && decl.id) {
      if (
        hasNoSideEffectsAnnotation(ctx, decl) ||
        (decl !== stmt && hasNoSideEffectsAnnotation(ctx, stmt))
      ) {
        mark(decl.id)
      }
    } else if (decl.type === 'VariableDeclaration') {
      // before a `const` statement (or its `export`), the annotation is
      // its first declarator's, as Rollup and esbuild read it
      const first =
        decl.kind === 'const' &&
        (hasNoSideEffectsAnnotation(ctx, decl) ||
          (decl !== stmt && hasNoSideEffectsAnnotation(ctx, stmt)))
          ? decl.declarations[0]
          : undefined
      for (const d of decl.declarations) {
        if (
          d.init &&
          (d.init.type === 'ArrowFunctionExpression' ||
            d.init.type === 'FunctionExpression') &&
          (d === first || hasNoSideEffectsAnnotation(ctx, d.init))
        ) {
          mark(d.id)
        }
      }
    }
  }
}

function hasPureAnnotation(ctx: PurityContext, node: Node): boolean {
  const c = commentBefore(ctx.comments, ctx.file.source, node.start)
  return c !== null && PURE_RE.test(c.value)
}

function hasNoSideEffectsAnnotation(ctx: PurityContext, node: Node): boolean {
  const c = commentBefore(ctx.comments, ctx.file.source, node.start)
  return c !== null && NSE_RE.test(c.value)
}

export function isPrimitiveLiteral(node: Node): boolean {
  switch (node.type) {
    case 'Literal':
      // a regex literal is an object: its identity and `lastIndex` are state
      return !('regex' in node)
    case 'TemplateLiteral':
      return node.expressions.length === 0
    case 'UnaryExpression':
      return (
        (node.operator === '-' ||
          node.operator === '+' ||
          node.operator === '!' ||
          node.operator === 'void') &&
        isPrimitiveLiteral(node.argument)
      )
    case 'Identifier':
      return node.name === 'undefined'
    default:
      return false
  }
}

/**
 * Whether an initialiser's value is a function or a primitive, whatever it
 * costs to compute: nothing can observe the identity of a copy of it. An
 * object or array literal, a class, a `new`, a call (annotated or not), a
 * regex, a tagged template, a member read, JSX: a value with an identity,
 * or one that may be. An identifier is an alias: the binding it names is
 * judged on its own (placement follows the read). A binary or unary
 * expression and a template literal always evaluate to a primitive.
 */
export function isIdentityFreeValue(expr: Node | null): boolean {
  if (expr === null) {
    return true
  }
  const node = unwrapExpression(expr)
  switch (node.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'Identifier':
    case 'TemplateLiteral':
    case 'BinaryExpression':
    case 'UpdateExpression':
      return true
    case 'Literal':
      return !('regex' in node)
    case 'UnaryExpression':
      return node.operator !== 'delete'
    case 'ConditionalExpression':
      return (
        isIdentityFreeValue(node.consequent) &&
        isIdentityFreeValue(node.alternate)
      )
    case 'LogicalExpression':
      return isIdentityFreeValue(node.left) && isIdentityFreeValue(node.right)
    case 'SequenceExpression':
      return isIdentityFreeValue(node.expressions.at(-1) ?? null)
    default:
      return false
  }
}

export function isPureExpression(
  ctx: PurityContext,
  expr: Node | null,
): boolean {
  if (expr === null) {
    return true
  }
  const node = unwrapExpression(expr)
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
    case 'ThisExpression':
    case 'MetaProperty':
    case 'ArrowFunctionExpression':
      return true
    case 'FunctionExpression':
      return true
    case 'ClassExpression':
      return isPureClass(ctx, node)
    case 'TemplateLiteral':
      return node.expressions.every((e) => isPureExpression(ctx, e))
    case 'ArrayExpression':
      return node.elements.every(
        (e) =>
          e === null ||
          (e.type === 'SpreadElement'
            ? (ctx.language === true ||
                unwrapExpression(e.argument).type === 'ArrayExpression') &&
              isPureExpression(ctx, e.argument)
            : isPureExpression(ctx, e)),
      )
    case 'ObjectExpression':
      return node.properties.every((p) => {
        if (p.type === 'SpreadElement') {
          return (
            (ctx.language === true ||
              unwrapExpression(p.argument).type === 'ObjectExpression') &&
            isPureExpression(ctx, p.argument)
          )
        }
        if (p.computed && !isPureExpression(ctx, p.key as Node)) {
          return false
        }
        if (p.kind !== 'init') {
          return true
        }
        return isPureExpression(ctx, p.value)
      })
    case 'UnaryExpression':
      return node.operator !== 'delete' && isPureExpression(ctx, node.argument)
    case 'BinaryExpression':
      return (
        (ctx.language === true ||
          (node.operator !== 'in' && node.operator !== 'instanceof')) &&
        isPureExpression(ctx, node.left) &&
        isPureExpression(ctx, node.right)
      )
    case 'LogicalExpression':
      return (
        isPureExpression(ctx, node.left) && isPureExpression(ctx, node.right)
      )
    case 'ConditionalExpression':
      return (
        isPureExpression(ctx, node.test) &&
        isPureExpression(ctx, node.consequent) &&
        isPureExpression(ctx, node.alternate)
      )
    case 'SequenceExpression':
      return node.expressions.every((e) => isPureExpression(ctx, e))
    case 'CallExpression':
    case 'NewExpression': {
      if (hasPureAnnotation(ctx, node) || hasPureAnnotation(ctx, expr)) {
        return node.arguments.every((a) =>
          a.type === 'SpreadElement' ? false : isPureExpression(ctx, a),
        )
      }
      if (
        node.type === 'CallExpression' &&
        isPureCallee(ctx, unwrapExpression(node.callee))
      ) {
        return node.arguments.every((a) =>
          a.type === 'SpreadElement' ? false : isPureExpression(ctx, a),
        )
      }
      return (
        (ctx.builders !== undefined &&
          node.type === 'CallExpression' &&
          builderCall(ctx, ctx.builders, node) !== null) ||
        (ctx.language === true && isLanguageCall(ctx, node))
      )
    }
    case 'JSXElement': {
      if (!isPureJsxTag(ctx, node.openingElement.name)) {
        return false
      }
      return (
        node.openingElement.attributes.every((a) =>
          a.type === 'JSXSpreadAttribute'
            ? ctx.language === true && isPureExpression(ctx, a.argument)
            : a.value === null ||
                a.value.type === 'Literal' ||
                a.value.type === 'JSXElement' ||
                a.value.type === 'JSXFragment'
              ? a.value === null || isPureExpression(ctx, a.value)
              : a.value.expression.type === 'JSXEmptyExpression' ||
                isPureExpression(ctx, a.value.expression),
        ) && node.children.every((ch) => isPureJsxChild(ctx, ch))
      )
    }
    case 'JSXFragment':
      return node.children.every((ch) => isPureJsxChild(ctx, ch))
    case 'MemberExpression':
      return (
        isPlainMemberRead(ctx, node) ||
        (ctx.language === true &&
          isPureExpression(ctx, node.object as Node) &&
          (!node.computed || isPureExpression(ctx, node.property as Node)))
      )
    case 'ChainExpression':
      return ctx.language === true && isPureExpression(ctx, node.expression)
    case 'TaggedTemplateExpression':
      return (
        ctx.language === true &&
        languageCallee(ctx, node.tag, false) &&
        node.quasi.expressions.every((e) => isPureExpression(ctx, e))
      )
    case 'ImportExpression':
    case 'AwaitExpression':
    case 'YieldExpression':
    case 'AssignmentExpression':
    case 'UpdateExpression':
    case 'Super':
    default:
      return false
  }
}

/**
 * A builder chain's call that is no effect in `b.env`, or null: a call of a
 * builder or env-only factory, or of a link method of the kind's runtime
 * builder on such an open call or on a `const` holding one (`b.locals`),
 * with every argument the environment keeps pure. The first argument of a
 * method whose argument the environment's compile erases is not evaluated
 * there (it is recorded in `b.erased`); a later one is kept.
 */
export function builderCall(
  ctx: PurityContext,
  b: BuilderPurity,
  call: Extract<Node, { type: 'CallExpression' }>,
): BuilderCall | null {
  const keptPure = (keep: 'client' | 'server' | 'both') => {
    const erases = keep !== 'both' && keep !== b.env
    return call.arguments.every((a, i) => {
      if (erases && i === 0) {
        b.erased.push({ start: a.start, end: a.end })
        return true
      }
      return a.type !== 'SpreadElement' && isPureExpression(ctx, a)
    })
  }
  const callee = unwrapExpression(call.callee)
  let factory: string | undefined
  if (callee.type === 'Identifier') {
    const imported = b.factories.get(callee.name)
    if (imported && refersTo(ctx, callee, imported.binding)) {
      factory = imported.kind
    }
  } else if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  ) {
    const object = unwrapExpression(callee.object as Node)
    const imported =
      object.type === 'Identifier' ? b.namespaces.get(object.name) : undefined
    const namespace =
      imported && refersTo(ctx, object, imported.binding)
        ? imported.factories
        : undefined
    if (namespace) {
      factory = ownEntry(namespace, callee.property.name)
    } else {
      const receiver = builderReceiverKind(ctx, b, object)
      const method = callee.property.name
      const methods = receiver === null ? undefined : b.links[receiver]
      const keep = methods && ownEntry(methods, method)
      if (keep === undefined || !keptPure(keep)) {
        return null
      }
      return {
        kind: receiver!,
        open: !(
          ownEntry(b.terminal, receiver!) === 'serverFn' && method === 'handler'
        ),
      }
    }
  }
  if (factory === undefined) {
    return null
  }
  const only = ownEntry(b.envOnly, factory)
  if (only === undefined && ownEntry(b.links, factory) === undefined) {
    // a factory of no builder chain (`createStart`, a component)
    return null
  }
  // (an env-only fn is a function, no builder)
  return keptPure(only ?? 'both')
    ? { kind: factory, open: only === undefined }
    : null
}

/**
 * The receiver of call `call` when it is a link (`b.server(f)`) on a
 * module-level `const` holding a builder of a kind whose links write the
 * builder they are called on (`BuilderPurity.writes`: a middleware's
 * assign its options; R139): the identifier naming the builder, else null.
 * It writes that builder wherever it stands, whatever its arguments (a
 * member write of it: the reference's classification).
 */
export function linkedBuilder(
  file: SourceFile,
  b: BuilderPurity,
  call: Node,
): Node | null {
  if (call.type !== 'CallExpression') {
    return null
  }
  const callee = unwrapExpression(call.callee)
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier'
  ) {
    return null
  }
  const object = unwrapExpression(callee.object as Node)
  if (object.type !== 'Identifier') {
    return null
  }
  // (`locals` holds module-level names: a function's own binding of the
  // name is another one)
  const kind = b.locals.get(object.name)
  const binding = file.referenceOf(object)?.binding
  return kind !== undefined &&
    b.writes.has(kind) &&
    binding?.scope === file.rootScope &&
    ownEntry(b.links[kind] ?? {}, callee.property.name) !== undefined
    ? object
    : null
}

/** Whether an identifier refers to the binding `id` (an import's). */
function refersTo(ctx: PurityContext, node: Node, id: number): boolean {
  return ctx.file.referenceOf(node)?.binding?.id === id
}

/** The builder kind of a link's receiver: an open chain's call, or a `const` holding one. */
function builderReceiverKind(
  ctx: PurityContext,
  b: BuilderPurity,
  node: Node,
): string | null {
  const n = unwrapExpression(node)
  if (n.type === 'CallExpression') {
    const c = builderCall(ctx, b, n)
    return c?.open ? c.kind : null
  }
  if (n.type === 'Identifier') {
    return b.locals.get(n.name) ?? null
  }
  return null
}

/** `x.y` / `x['y']` of a namespace import (`namespaceImports`) or of a plain enum. */
function isPlainMemberRead(ctx: PurityContext, node: Node): boolean {
  if (
    node.type !== 'MemberExpression' ||
    (node.computed &&
      !(
        node.property.type === 'Literal' &&
        typeof node.property.value === 'string'
      ))
  ) {
    return false
  }
  const object = unwrapExpression(node.object as Node)
  if (object.type !== 'Identifier') {
    return false
  }
  const b = ctx.file.referenceOf(object)?.binding
  return (
    b !== undefined &&
    b !== null &&
    (ctx.namespaceImports.has(b.id) || isPlainEnum(ctx, b))
  )
}

/**
 * An enum of this module whose object holds data, written only where the
 * mutation model sees it: not a declared one (whatever the global is), no
 * namespace merged in (its functions can write the object), and every value
 * use a member it declares or an export, so no alias or callee can write it or
 * define a getter on it unseen (`w(E)`, `const a = E`, `import F = E`,
 * `E.__defineGetter__(…)`, `E[k]`).
 */
function isPlainEnum(ctx: PurityContext, b: Binding): boolean {
  if (
    !b.has(BindingFlags.RegularEnum | BindingFlags.ConstEnum) ||
    b.has(BindingFlags.Ambient | BindingFlags.ValueModule)
  ) {
    return false
  }
  const members = new Set<string>()
  for (const id of b.declarations) {
    const decl = ctx.file.parentOf(id)
    if (decl?.type === 'TSEnumDeclaration') {
      for (const m of decl.body.members) {
        if (m.id.type !== 'TemplateLiteral') {
          members.add(m.id.type === 'Identifier' ? m.id.name : m.id.value)
        }
      }
    }
  }
  return b.references.every((r) => {
    if (r.inTypePosition) {
      return true
    }
    const parent = ctx.file.parentOf(r.node)
    if (parent?.type === 'ExportSpecifier') {
      return true
    }
    if (
      parent?.type !== 'MemberExpression' ||
      parent.object.start !== r.node.start
    ) {
      return false
    }
    const name = parent.computed
      ? parent.property.type === 'Literal'
        ? parent.property.value
        : null
      : parent.property.type === 'Identifier'
        ? parent.property.name
        : null
    return typeof name === 'string' && members.has(name)
  })
}

/** Whether a callee's calls are pure when their arguments are (`noSideEffectCallees`, `pureNamespaces`). */
function isPureCallee(ctx: PurityContext, callee: Node): boolean {
  if (callee.type === 'Identifier') {
    if (ctx.noSideEffectCallees.size === 0) {
      return false
    }
    const b = ctx.file.referenceOf(callee)?.binding
    return b !== undefined && b !== null && ctx.noSideEffectCallees.has(b.id)
  }
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    ctx.pureNamespaces.size > 0
  ) {
    const object = unwrapExpression(callee.object as Node)
    if (object.type !== 'Identifier') {
      return false
    }
    const b = ctx.file.referenceOf(object)?.binding
    return (
      b !== undefined &&
      b !== null &&
      ctx.pureNamespaces.get(b.id)?.has(callee.property.name) === true
    )
  }
  return false
}

/**
 * Whether the purity model knows that calling `call` (a call or `new`)
 * changes nothing it is called on: a language operation (rule L:
 * `JSON.parse`, `Object.keys`, a method of a literal), a pure export of a
 * known package or a `#__NO_SIDE_EFFECTS__` function. The statement rule's
 * "what it changes" asks it of a method call (`changesObject`); a member of
 * a namespace import is another module's object (`Sentry.init()`).
 */
export function callChangesNothing(ctx: PurityContext, call: Node): boolean {
  if (call.type !== 'CallExpression' && call.type !== 'NewExpression') {
    return false
  }
  const callee = unwrapExpression(call.callee as Node)
  return (
    languageCallee(ctx, callee, call.type === 'NewExpression') ||
    isPureCallee(ctx, callee)
  )
}

/** A JSX tag whose element runs no code of its own: intrinsic (`div`), or bound (`<Page>`, `<ui.Card>`). */
function isPureJsxTag(ctx: PurityContext, name: Node): boolean {
  if (name.type === 'JSXNamespacedName') {
    return false
  }
  if (name.type === 'JSXIdentifier') {
    const c = name.name.charCodeAt(0)
    const intrinsic = c >= 97 && c <= 122
    if (!intrinsic && !ctx.file.referenceOf(name)?.binding) {
      return false
    }
  }
  return true
}

function isPureJsxChild(ctx: PurityContext, ch: Node): boolean {
  switch (ch.type) {
    case 'JSXText':
      return true
    case 'JSXElement':
    case 'JSXFragment':
      return isPureExpression(ctx, ch)
    case 'JSXExpressionContainer':
      return (
        ch.expression.type === 'JSXEmptyExpression' ||
        isPureExpression(ctx, ch.expression)
      )
    default:
      return false
  }
}

export function isPureClass(
  ctx: PurityContext,
  node: Extract<Node, { type: 'ClassDeclaration' | 'ClassExpression' }>,
): boolean {
  if (node.decorators.length > 0) {
    return false
  }
  if (node.superClass !== null) {
    const sc = unwrapExpression(node.superClass)
    if (sc.type !== 'Identifier') {
      return false
    }
  }
  for (const el of node.body.body) {
    switch (el.type) {
      case 'StaticBlock':
        return false
      case 'PropertyDefinition':
      case 'AccessorProperty':
        if (el.decorators.length > 0) {
          return false
        }
        if (el.computed && !isPureExpression(ctx, el.key as Node)) {
          return false
        }
        if (el.static && !isPureExpression(ctx, el.value)) {
          return false
        }
        break
      case 'MethodDefinition':
        // a decorator on the method or on one of its parameters
        // (`constructor(@Inject() dep)`) runs when the class is defined
        if (
          el.decorators.length > 0 ||
          el.value.params.some((p) => (p.decorators?.length ?? 0) > 0)
        ) {
          return false
        }
        if (el.computed && !isPureExpression(ctx, el.key as Node)) {
          return false
        }
        break
      default:
        break
    }
  }
  return true
}

export function isPureDeclarator(
  ctx: PurityContext,
  d: VariableDeclarator,
): boolean {
  return (
    (d.init === null || isPureExpression(ctx, d.init)) &&
    isPurePattern(ctx, d.id)
  )
}

/**
 * Whether destructuring into a declaration's pattern runs no user code of
 * its own: every default value (`{ a = f() }`, `[a = f()]`) and computed
 * key (`{ [k()]: v }`) is pure, as an initialiser must be. The property
 * reads themselves are not judged (unlike `const a = x.a`): a getter, or an
 * iterator an array pattern runs, stays outside the model (R97).
 */
function isPurePattern(ctx: PurityContext, p: Node): boolean {
  switch (p.type) {
    case 'Identifier':
      return true
    case 'AssignmentPattern':
      return isPureExpression(ctx, p.right) && isPurePattern(ctx, p.left)
    case 'RestElement':
      return isPurePattern(ctx, p.argument)
    case 'ArrayPattern':
      return p.elements.every((e) => e === null || isPurePattern(ctx, e))
    case 'ObjectPattern':
      return p.properties.every((prop) =>
        prop.type === 'RestElement'
          ? isPurePattern(ctx, prop)
          : (!prop.computed || isPureExpression(ctx, prop.key as Node)) &&
            isPurePattern(ctx, prop.value),
      )
    default:
      return false
  }
}

/** Whether a top-level statement has effects at module evaluation (the J6 effect scan). */
export function statementHasEffects(
  ctx: PurityContext,
  stmt: Statement | Node,
): boolean {
  switch (stmt.type) {
    case 'ImportDeclaration':
      return stmt.specifiers.length === 0 && stmt.importKind !== 'type'
    case 'ExportAllDeclaration':
      return stmt.exportKind !== 'type'
    case 'ExportNamedDeclaration':
      if (stmt.source !== null) {
        return stmt.exportKind !== 'type'
      }
      return stmt.declaration === null
        ? false
        : statementHasEffects(ctx, stmt.declaration)
    case 'ExportDefaultDeclaration':
      return statementHasEffects(ctx, stmt.declaration)
    case 'FunctionDeclaration':
    case 'TSDeclareFunction':
    case 'TSTypeAliasDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSImportEqualsDeclaration':
    case 'EmptyStatement':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return false
    case 'TSEnumDeclaration':
      // the members' initializers run as the module evaluates
      return (
        !stmt.declare &&
        stmt.body.members.some(
          (m) => m.initializer && !isPureExpression(ctx, m.initializer),
        )
      )
    case 'ClassDeclaration':
    case 'ClassExpression':
      return !isPureClass(ctx, stmt)
    case 'VariableDeclaration':
      return stmt.declarations.some((d) => !isPureDeclarator(ctx, d))
    case 'TSModuleDeclaration':
      return (
        !stmt.declare &&
        stmt.body !== undefined &&
        stmt.body.body.some((s) => statementHasEffects(ctx, s))
      )
    case 'ExpressionStatement':
      return !isPureExpression(ctx, stmt.expression)
    default:
      // if/for/try/… and any expression used as `export default <expr>`
      return !(
        isExpressionNode(stmt) && isPureExpression(ctx, stmt as Expression)
      )
  }
}

function isExpressionNode(n: Node): boolean {
  switch (n.type) {
    case 'Literal':
    case 'Identifier':
    case 'ThisExpression':
    case 'ArrayExpression':
    case 'ObjectExpression':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'ClassExpression':
    case 'TaggedTemplateExpression':
    case 'TemplateLiteral':
    case 'MemberExpression':
    case 'CallExpression':
    case 'NewExpression':
    case 'ChainExpression':
    case 'SequenceExpression':
    case 'ParenthesizedExpression':
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'ConditionalExpression':
    case 'UnaryExpression':
    case 'UpdateExpression':
    case 'AssignmentExpression':
    case 'YieldExpression':
    case 'AwaitExpression':
    case 'ImportExpression':
    case 'MetaProperty':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
    case 'TSNonNullExpression':
    case 'TSInstantiationExpression':
    case 'JSXElement':
    case 'JSXFragment':
      return true
    default:
      return false
  }
}

/**
 * Records the module-level `const`s of `declaration` whose value is a
 * builder chain's builder (`b.locals`: its later links read them as
 * receivers): after its statement is classified, so a read before the
 * declaration (a TDZ error) is no such receiver.
 */
export function noteBuilderConsts(
  ctx: PurityContext,
  b: BuilderPurity,
  declaration: Extract<Node, { type: 'VariableDeclaration' }>,
): void {
  if (declaration.kind !== 'const') {
    return
  }
  for (const d of declaration.declarations) {
    if (d.id.type !== 'Identifier' || d.init === null) {
      continue
    }
    const init = unwrapExpression(d.init)
    if (init.type !== 'CallExpression') {
      continue
    }
    const call = builderCall(ctx, b, init)
    if (call?.open) {
      b.locals.set(d.id.name, call.kind)
    }
  }
}
