/**
 * Abstract value domain and the callable-builder transition (DESIGN §2.9.2,
 * R8). The same transfer function serves local analysis and summaries.
 * Recognition is by specifier through a pluggable `RecognizerTable` (Start
 * supplies its kinds; the core ships an empty table).
 */
import type { Node, SourceFile } from 'yuku'
import type { Range } from './header'

export type Kind = string

export interface LinkSite {
  range: Range
  /** The module owning the link's edit (null = the analysed module). */
  canonicalId: string | null
}

export type LinkMethod =
  | 'middleware'
  | 'validator'
  | 'inputValidator'
  | 'handler'
  | 'server'
  | 'client'
  | 'call'

export interface Link {
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
  | { t: 'function'; returns: AbstractValue | { t: 'param'; index: number } }
  | { t: 'importRef'; specifier: string; name: string }
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

function unwrap(node: Node): Node {
  let n = node
  for (;;) {
    switch (n.type) {
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
      case 'TSInstantiationExpression':
        n = n.expression
        continue
      case 'ChainExpression':
        n = n.expression
        continue
      default:
        return n
    }
  }
}

export interface ValueAnalysisOptions {
  table: RecognizerTable
  /** Cross-module lookups (phase A results); default keeps imports symbolic. */
  resolveImport?: (specifier: string, name: string) => AbstractValue
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

  /** The value of a module-level binding's name node. */
  valueOfBindingNode(nameNode: Node): AbstractValue {
    const b = this.file.bindingOf(nameNode)
    if (!b) {
      return UNKNOWN
    }
    return this.valueOfBinding(b.id)
  }

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
    const decl = b.declarations[0]
    if (!decl) {
      return UNKNOWN
    }
    const parent = this.file.parentOf(decl)
    if (!parent) {
      return UNKNOWN
    }
    if (
      parent.type === 'VariableDeclarator' &&
      parent.id === decl &&
      parent.init
    ) {
      return this.valueOf(parent.init)
    }
    if (parent.type === 'FunctionDeclaration') {
      return this.functionValue(parent)
    }
    return UNKNOWN
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
    const node = unwrap(expr)
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
      case 'MemberExpression': {
        if (node.computed) {
          return UNKNOWN
        }
        const prop = node.property
        const name = prop.type === 'Identifier' ? prop.name : null
        if (name === null) {
          return UNKNOWN
        }
        const obj = this.valueOf(node.object)
        if (obj.t === 'namespace') {
          const known = recognizeImport(this.opts.table, obj.specifier, name)
          if (known.t !== 'unknown') {
            return known
          }
          return this.opts.resolveImport
            ? this.opts.resolveImport(obj.specifier, name)
            : { t: 'importRef', specifier: obj.specifier, name }
        }
        if (obj.t === 'startInstance') {
          const kind = this.opts.table.startMembers?.[name]
          return kind ? { t: 'factory', kind } : UNKNOWN
        }
        // `builder.method` is not a value by itself; the call transfers (see CallExpression)
        return UNKNOWN
      }
      case 'CallExpression': {
        const callee = unwrap(node.callee)
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier'
        ) {
          const method = callee.property.name
          const recv = this.valueOf(callee.object)
          if (recv.t === 'builder') {
            const site: LinkSite = {
              range: { start: node.start, end: node.end },
              canonicalId: null,
            }
            const terminal = this.opts.table.terminal[recv.kind] ?? 'serverFn'
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
                  return {
                    t: 'isoFn',
                    links: [...recv.links, { method, site }],
                  }
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
          if (
            recv.t === 'isoFn' &&
            (method === 'server' || method === 'client')
          ) {
            return {
              t: 'isoFn',
              links: [
                ...recv.links,
                {
                  method,
                  site: {
                    range: { start: node.start, end: node.end },
                    canonicalId: null,
                  },
                },
              ],
            }
          }
        }
        const fn = this.valueOf(node.callee)
        const site: LinkSite = {
          range: { start: node.start, end: node.end },
          canonicalId: null,
        }
        if (fn.t === 'factory') {
          const table = this.opts.table
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
        if (fn.t === 'builder') {
          // R8: calling a configured builder keeps links/provenance
          return {
            t: 'builder',
            kind: fn.kind,
            links: [...fn.links, { method: 'call', site }],
          }
        }
        if (fn.t === 'function') {
          const r = fn.returns
          if (r.t === 'param') {
            const arg = node.arguments[r.index]
            return arg && arg.type !== 'SpreadElement'
              ? this.valueOf(arg)
              : UNKNOWN
          }
          return r
        }
        return UNKNOWN
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
    if (body === null) {
      return UNKNOWN
    }
    if (fn.type === 'ArrowFunctionExpression' && fn.expression) {
      ret = body
    } else if (body.type === 'BlockStatement') {
      const returns = body.body.filter((s) => s.type === 'ReturnStatement')
      if (
        returns.length === 1 &&
        body.body.every(
          (s) =>
            s.type === 'ReturnStatement' ||
            s.type === 'VariableDeclaration' ||
            s.type === 'FunctionDeclaration',
        )
      ) {
        ret = (returns[0] as Extract<Node, { type: 'ReturnStatement' }>)
          .argument
      }
    }
    if (!ret) {
      return { t: 'function', returns: UNKNOWN }
    }
    const u = unwrap(ret)
    if (u.type === 'Identifier') {
      const ref = this.file.referenceOf(u)
      const b = ref?.binding
      if (b) {
        const idx = fn.params.findIndex(
          (p) => p.type === 'Identifier' && this.file.bindingOf(p)?.id === b.id,
        )
        if (idx !== -1) {
          return { t: 'function', returns: { t: 'param', index: idx } }
        }
      }
    }
    return { t: 'function', returns: this.valueOf(ret) }
  }
}

/** Strips link sites to method names (export-facts digest input, R20). */
export function stripSites(
  v: AbstractValue | { t: 'param'; index: number },
): unknown {
  switch (v.t) {
    case 'builder':
      return { t: v.t, kind: v.kind, links: v.links.map((l) => l.method) }
    case 'serverFn':
    case 'middleware':
    case 'isoFn':
      return { t: v.t, links: v.links.map((l) => l.method) }
    case 'function':
      return { t: v.t, returns: stripSites(v.returns) }
    default:
      return v
  }
}
