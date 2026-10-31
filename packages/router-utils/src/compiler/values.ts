/**
 * Abstract value domain and the callable-builder transition. The same transfer
 * function serves local analysis and summaries. Recognition is by specifier
 * through a pluggable `RecognizerTable` (Start supplies its kinds; the core
 * ships an empty table).
 *
 * Values a module cannot evaluate on its own (a call of an imported function,
 * a member of an imported value) stay **symbolic terms** (`importRef`,
 * `member`, `call`): a summary records them, and a consumer reduces them
 * once it knows what the imports are (`applyMember`/`applyCall` are the
 * transfer function on already-known values; `stampSites` gives links from
 * another module their owner).
 */
import { unwrapExpression } from './source'
import type { Node, SourceFile } from 'yuku'
import type { Range } from './header'

type Kind = string

interface LinkSite {
  range: Range
  /** The module owning the link's edit (null = the analysed module). */
  canonicalId: string | null
}

type LinkMethod =
  | 'middleware'
  | 'validator'
  | 'inputValidator'
  | 'handler'
  | 'server'
  | 'client'
  | 'call'

interface Link {
  method: LinkMethod
  site: LinkSite
}

export type AbstractValue =
  | { t: 'factory'; kind: Kind }
  | { t: 'startInstance' }
  | { t: 'builder'; kind: Kind; links: Array<Link> }
  | { t: 'serverFn' | 'middleware' | 'isoFn'; links: Array<Link> }
  | { t: 'envOnlyResult'; kind: 'server' | 'client' }
  | { t: 'namespace'; specifier: string }
  | { t: 'function'; returns: AbstractValue }
  /** Symbolic: an import nobody resolved yet (summaries; local analysis without `resolveImport`). */
  | { t: 'importRef'; specifier: string; name: string }
  /** Symbolic: a member of a value that is not reducible yet. */
  | { t: 'member'; object: AbstractValue; name: string }
  /** Symbolic: a call of a value that is not reducible yet (args are the argument values, null for spreads). */
  | {
      t: 'call'
      callee: AbstractValue
      args: Array<AbstractValue | null>
      site: LinkSite
    }
  /** Symbolic: one of two values (`c ? a : b`, `a ?? b`) that are not reducible yet. */
  | { t: 'join'; a: AbstractValue; b: AbstractValue }
  | { t: 'unknown' }

export const UNKNOWN: AbstractValue = { t: 'unknown' }

export interface RecognizerTable {
  /** specifier → exported name → factory kind. */
  factories: Record<string, Record<string, Kind>>
  /** Kinds whose call yields a configurable builder. */
  builderKinds: ReadonlySet<Kind>
  /** The terminal value a builder kind reaches (`handler` → serverFn; `server`/`client` → isoFn; value use → middleware). */
  terminal: Record<Kind, 'serverFn' | 'middleware' | 'isoFn'>
  /** Kinds whose call site is an env-only candidate. */
  envOnlyKinds: Record<Kind, 'server' | 'client'>
  /** The `createStart` kind, if any. */
  startKind?: Kind
  /** Members of a start instance that are factories. */
  startMembers?: Record<string, Kind>
  /**
   * specifier → exports whose call is pure when its arguments are
   * (TanStack's own APIs, audited per package by the planner that supplies
   * them). Recognised by import binding (renamed, or a namespace member),
   * never by spelling; re-exports are not followed; nothing else is assumed
   * pure.
   */
  pureCalls?: Record<string, ReadonlySet<string>>
}

export const EMPTY_RECOGNIZER: RecognizerTable = {
  factories: {},
  builderKinds: new Set(),
  terminal: {},
  envOnlyKinds: {},
}

export function recognizeImport(
  table: RecognizerTable,
  specifier: string,
  name: string,
): AbstractValue {
  const kind = table.factories[specifier]?.[name]
  if (kind === undefined) {
    return UNKNOWN
  }
  return { t: 'factory', kind }
}

/** Whether `specifier` is a known package of the table (recognised by specifier, never resolved: its exports are known by name). */
export function isKnownSpecifier(
  table: RecognizerTable,
  specifier: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(table.factories, specifier)
}

function isSymbolicValue(v: AbstractValue): boolean {
  return (
    v.t === 'importRef' || v.t === 'member' || v.t === 'call' || v.t === 'join'
  )
}

type ImportResolver = (specifier: string, name: string) => AbstractValue

/**
 * The transfer function of a member access `object.name` on a known value.
 * `resolveImport` answers members of unknown-package namespaces (default:
 * symbolic `importRef`).
 */
export function applyMember(
  table: RecognizerTable,
  obj: AbstractValue,
  name: string,
  resolveImport?: ImportResolver,
): AbstractValue {
  switch (obj.t) {
    case 'namespace': {
      const known = recognizeImport(table, obj.specifier, name)
      if (known.t !== 'unknown') {
        return known
      }
      return resolveImport
        ? resolveImport(obj.specifier, name)
        : { t: 'importRef', specifier: obj.specifier, name }
    }
    case 'startInstance': {
      const kind = table.startMembers?.[name]
      return kind ? { t: 'factory', kind } : UNKNOWN
    }
    case 'factory':
      // `createServerFn.call(thisArg, options)`: its call is the factory's
      return name === 'call' && table.builderKinds.has(obj.kind) ? obj : UNKNOWN
    case 'builder':
    case 'isoFn':
    case 'importRef':
    case 'member':
    case 'call':
    case 'join':
      return { t: 'member', object: obj, name }
    default:
      return UNKNOWN
  }
}

/**
 * The transfer function of a call `fn(args)` on a known callee value. `args`
 * is a thunk: argument values are only computed when the callee needs them
 * (a symbolic callee).
 */
export function applyCall(
  table: RecognizerTable,
  fn: AbstractValue,
  args: () => Array<AbstractValue | null>,
  site: LinkSite,
): AbstractValue {
  switch (fn.t) {
    case 'member': {
      const recv = fn.object
      const method = fn.name
      if (recv.t === 'builder') {
        const terminal = table.terminal[recv.kind] ?? 'serverFn'
        switch (method) {
          case 'middleware':
          case 'validator':
          case 'inputValidator':
            return {
              t: 'builder',
              kind: recv.kind,
              links: [...recv.links, { method, site }],
            }
          case 'handler':
            return terminal === 'serverFn'
              ? { t: 'serverFn', links: [...recv.links, { method, site }] }
              : {
                  t: 'builder',
                  kind: recv.kind,
                  links: [...recv.links, { method, site }],
                }
          case 'server':
          case 'client':
            if (terminal === 'isoFn') {
              return { t: 'isoFn', links: [...recv.links, { method, site }] }
            }
            return {
              t: 'builder',
              kind: recv.kind,
              links: [...recv.links, { method, site }],
            }
          default:
            return UNKNOWN
        }
      }
      if (recv.t === 'isoFn' && (method === 'server' || method === 'client')) {
        return { t: 'isoFn', links: [...recv.links, { method, site }] }
      }
      if (isSymbolicValue(recv)) {
        return { t: 'call', callee: fn, args: args(), site }
      }
      return UNKNOWN
    }
    case 'factory': {
      if (table.startKind !== undefined && fn.kind === table.startKind) {
        return { t: 'startInstance' }
      }
      if (table.builderKinds.has(fn.kind)) {
        return { t: 'builder', kind: fn.kind, links: [] }
      }
      const envOnly = table.envOnlyKinds[fn.kind]
      if (envOnly) {
        return { t: 'envOnlyResult', kind: envOnly }
      }
      return UNKNOWN
    }
    case 'builder':
      // calling a configured builder keeps links/provenance
      return {
        t: 'builder',
        kind: fn.kind,
        links: [...fn.links, { method: 'call', site }],
      }
    case 'function':
      return fn.returns
    case 'importRef':
    case 'call':
    case 'join':
      return { t: 'call', callee: fn, args: args(), site }
    default:
      return UNKNOWN
  }
}

/**
 * The transfer function of an expression that is one of two values
 * (`c ? a : b`, `a ?? b`, `a || b`, `a && b`): known when both are the same
 * kind of value. A link only one of them has is dropped (a middleware is
 * configured on both sides or on neither); a symbolic side keeps the join
 * symbolic, so a summary and the local analysis agree once it is reduced.
 */
export function joinValues(a: AbstractValue, b: AbstractValue): AbstractValue {
  if (isSymbolicValue(a) || isSymbolicValue(b)) {
    return { t: 'join', a, b }
  }
  const common = (x: Array<Link>, y: Array<Link>) =>
    x.filter((l) => y.some((m) => m.method === l.method))
  switch (a.t) {
    case 'factory':
      return b.t === 'factory' && b.kind === a.kind ? a : UNKNOWN
    case 'startInstance':
      return b.t === 'startInstance' ? a : UNKNOWN
    case 'builder':
      return b.t === 'builder' && b.kind === a.kind
        ? { t: 'builder', kind: a.kind, links: common(a.links, b.links) }
        : UNKNOWN
    case 'serverFn':
    case 'middleware':
    case 'isoFn':
      return b.t === a.t ? { t: a.t, links: common(a.links, b.links) } : UNKNOWN
    case 'envOnlyResult':
      return b.t === 'envOnlyResult' && b.kind === a.kind ? a : UNKNOWN
    case 'namespace':
      return b.t === 'namespace' && b.specifier === a.specifier ? a : UNKNOWN
    default:
      return UNKNOWN
  }
}

/** Gives every link site of `v` without an owner the owner `canonicalId` (a value adopted from another module's summary). */
export function stampSites(
  v: AbstractValue,
  canonicalId: string,
): AbstractValue {
  const site = (s: LinkSite): LinkSite =>
    s.canonicalId === null ? { range: s.range, canonicalId } : s
  const links = (ls: Array<Link>) =>
    ls.map((l) => ({ method: l.method, site: site(l.site) }))
  switch (v.t) {
    case 'builder':
      return { t: 'builder', kind: v.kind, links: links(v.links) }
    case 'serverFn':
    case 'middleware':
    case 'isoFn':
      return { t: v.t, links: links(v.links) }
    case 'function':
      return {
        t: 'function',
        returns: stampSites(v.returns, canonicalId),
      }
    case 'member':
      return {
        t: 'member',
        object: stampSites(v.object, canonicalId),
        name: v.name,
      }
    case 'call':
      return {
        t: 'call',
        callee: stampSites(v.callee, canonicalId),
        args: v.args.map((a) =>
          a === null ? null : stampSites(a, canonicalId),
        ),
        site: site(v.site),
      }
    case 'join':
      return {
        t: 'join',
        a: stampSites(v.a, canonicalId),
        b: stampSites(v.b, canonicalId),
      }
    default:
      return v
  }
}

interface ValueAnalysisOptions {
  table: RecognizerTable
  /** Cross-module lookups (phase A results); default keeps imports symbolic. */
  resolveImport?: ImportResolver
  /** The module's top-level declarations by name offset (`ModuleAnalysis.declarations`): read before `parentOf`. */
  declarations?: ReadonlyMap<number, Node>
}

/**
 * The declaration (declarator or function declaration) a top-level name
 * belongs to, from a module's `declarations`; null for a nested name.
 */
export function declaredIn(
  declarations: ReadonlyMap<number, Node>,
  name: Node,
): Node | null {
  const d = declarations.get(name.start)
  return d !== undefined &&
    (d.type === 'VariableDeclarator' || d.type === 'FunctionDeclaration') &&
    d.id === name
    ? d
    : null
}

/**
 * Local value analysis over bindings of one file. Results are memoised per
 * node; the analysis lives with the `SourceFile` (ephemeral).
 */
export class ValueAnalysis {
  private readonly memo = new Map<Node, AbstractValue>()
  private readonly active = new Set<Node>()

  constructor(
    private readonly file: SourceFile,
    private readonly opts: ValueAnalysisOptions,
  ) {}

  valueOfBinding(bindingId: number): AbstractValue {
    const b = this.file.bindings[bindingId]
    if (!b) {
      return UNKNOWN
    }
    const imp = b.import
    if (imp) {
      if (imp.kind === 'namespace') {
        return { t: 'namespace', specifier: imp.specifier }
      }
      if (imp.kind === 'named' && imp.name !== null) {
        const known = recognizeImport(this.opts.table, imp.specifier, imp.name)
        if (known.t !== 'unknown') {
          return known
        }
        return this.opts.resolveImport
          ? this.opts.resolveImport(imp.specifier, imp.name)
          : { t: 'importRef', specifier: imp.specifier, name: imp.name }
      }
      return UNKNOWN
    }
    // (a type, an interface, a type-only namespace, an overload or a `declare`
    // of the same name holds no value)
    for (const decl of b.declarations) {
      const v = this.valueOfDeclaration(decl)
      if (v) {
        return v
      }
    }
    return UNKNOWN
  }

  private valueOfDeclaration(decl: Node): AbstractValue | null {
    const parent =
      (this.opts.declarations && declaredIn(this.opts.declarations, decl)) ??
      this.file.parentOf(decl)
    if (!parent) {
      return null
    }
    if (parent.type === 'VariableDeclarator' && parent.id === decl) {
      return parent.init ? this.valueOf(parent.init) : null
    }
    if (parent.type === 'FunctionDeclaration') {
      return parent.body ? this.functionValue(parent) : null
    }
    // `const { createServerFn: csf } = Start`: the member of the initialiser
    if (parent.type === 'Property' && parent.value === decl) {
      const key = staticPropertyKey(parent)
      const pattern = this.file.parentOf(parent)
      const declarator = pattern && this.file.parentOf(pattern)
      if (
        key !== null &&
        pattern?.type === 'ObjectPattern' &&
        declarator?.type === 'VariableDeclarator' &&
        declarator.id === pattern &&
        declarator.init
      ) {
        return applyMember(
          this.opts.table,
          this.valueOf(declarator.init),
          key,
          this.opts.resolveImport,
        )
      }
    }
    return null
  }

  valueOf(expr: Node): AbstractValue {
    const hit = this.memo.get(expr)
    if (hit) {
      return hit
    }
    if (this.active.has(expr)) {
      return UNKNOWN
    }
    this.active.add(expr)
    const v = this.compute(expr)
    this.active.delete(expr)
    this.memo.set(expr, v)
    return v
  }

  private compute(expr: Node): AbstractValue {
    const node = unwrapExpression(expr)
    switch (node.type) {
      case 'Identifier': {
        const ref = this.file.referenceOf(node)
        if (!ref || !ref.binding) {
          return UNKNOWN
        }
        return this.valueOfBinding(ref.binding.id)
      }
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        return this.functionValue(node)
      case 'SequenceExpression':
        return this.valueOf(node.expressions[node.expressions.length - 1]!)
      case 'ConditionalExpression':
        return joinValues(
          this.valueOf(node.consequent),
          this.valueOf(node.alternate),
        )
      case 'LogicalExpression':
        return joinValues(this.valueOf(node.left), this.valueOf(node.right))
      case 'MemberExpression': {
        if (node.computed) {
          return UNKNOWN
        }
        const prop = node.property
        const name = prop.type === 'Identifier' ? prop.name : null
        if (name === null) {
          return UNKNOWN
        }
        return applyMember(
          this.opts.table,
          this.valueOf(node.object),
          name,
          this.opts.resolveImport,
        )
      }
      case 'CallExpression': {
        const site: LinkSite = {
          range: { start: node.start, end: node.end },
          canonicalId: null,
        }
        const args = () =>
          node.arguments.map((a) =>
            a.type === 'SpreadElement' ? null : this.valueOf(a),
          )
        return applyCall(this.opts.table, this.valueOf(node.callee), args, site)
      }
      default:
        return UNKNOWN
    }
  }

  private functionValue(fn: Node): AbstractValue {
    if (
      fn.type !== 'ArrowFunctionExpression' &&
      fn.type !== 'FunctionExpression' &&
      fn.type !== 'FunctionDeclaration'
    ) {
      return UNKNOWN
    }
    const body = fn.body
    let ret: Node | null = null
    // an async or generator function returns a promise or an iterator
    if (body === null || fn.async || fn.generator) {
      return UNKNOWN
    }
    if (fn.type === 'ArrowFunctionExpression' && fn.expression) {
      ret = body
    } else if (body.type === 'BlockStatement') {
      const returns = body.body.filter((s) => s.type === 'ReturnStatement')
      if (
        returns.length === 1 &&
        body.body.every(
          (s) => s.type === 'ReturnStatement' || HOLDS_NO_RETURN.has(s.type),
        )
      ) {
        ret = (returns[0] as Extract<Node, { type: 'ReturnStatement' }>)
          .argument
      }
    }
    if (!ret) {
      return { t: 'function', returns: UNKNOWN }
    }
    return { t: 'function', returns: this.valueOf(ret) }
  }
}

/** Statements that cannot hold a `return` of the function whose body they are in. */
const HOLDS_NO_RETURN: ReadonlySet<string> = new Set([
  'ExpressionStatement',
  'VariableDeclaration',
  'FunctionDeclaration',
  'ClassDeclaration',
  'EmptyStatement',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
])

/** The name of a property with a static key (`a`, `'a'`), or null. */
export function staticPropertyKey(
  p: Extract<Node, { type: 'Property' }>,
): string | null {
  if (p.computed) {
    return null
  }
  if (p.key.type === 'Identifier') {
    return p.key.name
  }
  if (p.key.type === 'Literal' && typeof p.key.value === 'string') {
    return p.key.value
  }
  return null
}

/** Strips link sites to method names (export-facts digest input: importers observe the methods, not the arguments). */
export function stripSites(v: AbstractValue): unknown {
  switch (v.t) {
    case 'builder':
      return { t: v.t, kind: v.kind, links: v.links.map((l) => l.method) }
    case 'serverFn':
    case 'middleware':
    case 'isoFn':
      return { t: v.t, links: v.links.map((l) => l.method) }
    case 'function':
      return { t: v.t, returns: stripSites(v.returns) }
    case 'member':
      return { t: v.t, object: stripSites(v.object), name: v.name }
    case 'call':
      return {
        t: v.t,
        callee: stripSites(v.callee),
        args: v.args.map((a) => (a === null ? null : stripSites(a))),
      }
    case 'join':
      return { t: v.t, a: stripSites(v.a), b: stripSites(v.b) }
    default:
      return v
  }
}
