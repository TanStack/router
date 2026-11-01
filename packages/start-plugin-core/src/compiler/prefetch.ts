/**
 * Phase A of the Start planners: the abstract value
 * of every import this module may use as a Start value, resolved through
 * the raw-domain summaries of the modules it imports (never through the
 * bundler's transform pipeline, so an upstream plugin's output never changes
 * what a module exports). Known packages answer by specifier.
 * Symbolic terms of a summary (`importRef`, `member`, `call`) are reduced
 * with the core's transfer function once their imports are known.
 */
import {
  LookupPath,
  UNKNOWN,
  applyCall,
  applyMember,
  buildSummary,
  identify,
  isExpressionWrapper,
  isKnownSpecifier,
  joinValues,
  recognizeImport,
  stampSites,
  staticPropertyKey,
  unwrapExpression,
} from '@tanstack/router-utils/compiler'
import { NODE_MODULES_RE } from './scope'
import type {
  AbstractValue,
  ModuleAnalysis,
  YukuNode as Node,
  PrefetchContext,
  Range,
  RecognizerTable,
} from '@tanstack/router-utils/compiler'

/** Phase A result: `${specifier}\0${name}` → value, for this module's imports. */
export interface StartPrefetch {
  values: Map<string, AbstractValue>
  /** Whether any import carries a Start value (the async half of the gate). */
  relevant: boolean
  /** Where a project namespace with an open builder among its exports goes where the analysis does not follow it. */
  namespaceEscapes: Array<NamespaceEscape>
  /** A late-pass module's exports of an open builder: an importer reads the file, not this output, so it can't follow them. */
  lateExports: Array<Range>
}

export interface NamespaceEscape {
  range: Range
  /** The export server code can still be attached to. */
  exported: string
}

function importKey(specifier: string, name: string): string {
  return `${specifier}\u0000${name}`
}

/** Whether a value can lead to a Start candidate. */
export function isStartValue(
  table: RecognizerTable,
  v: AbstractValue,
): boolean {
  switch (v.t) {
    case 'factory':
    case 'startInstance':
    case 'builder':
    case 'serverFn':
    case 'middleware':
    case 'isoFn':
    case 'envOnlyResult':
      return true
    case 'namespace':
      return isKnownSpecifier(table, v.specifier)
    case 'function':
      return isStartValue(table, v.returns)
    default:
      return false
  }
}

/**
 * Whether server code can still be attached to a value (a `.handler()`,
 * `.server()`, `.validator()` to come, a factory call): wherever such a
 * value goes, the client compile must follow it, or the client keeps server
 * code it never saw. A server fn, an env-only result, a middleware with its
 * `.server()` and an isomorphic fn with its `.server()` take no more server
 * code (their types end there); they may go anywhere.
 */
export function takesServerCode(
  table: RecognizerTable,
  v: AbstractValue,
): boolean {
  switch (v.t) {
    case 'factory':
      return (
        table.builderKinds.has(v.kind) ||
        table.envOnlyKinds[v.kind] === 'server' ||
        v.kind === table.startKind ||
        v.kind.startsWith('rsc:')
      )
    case 'startInstance':
      return true
    case 'builder':
      return !(
        table.terminal[v.kind] === 'middleware' &&
        v.links.some((l) => l.method === 'server')
      )
    case 'isoFn':
      return (
        !v.links.some((l) => l.method === 'server') ||
        (v.returns !== undefined && takesServerCode(table, v.returns))
      )
    case 'namespace': {
      const exports = table.factories[v.specifier]
      return exports !== undefined
        ? Object.values(exports).some((kind) =>
            takesServerCode(table, { t: 'factory', kind }),
          )
        : false
    }
    case 'function':
      return takesServerCode(table, v.returns)
    default:
      return false
  }
}

/**
 * Where a value `outer` in `p` is only read: nothing can attach code to it
 * there (a test, an operator, an unknown tag excepted, the global `console`).
 */
export function isPlainRead(
  file: ModuleAnalysis['file'],
  p: Node,
  outer: Node,
): boolean {
  switch (p.type) {
    case 'CallExpression': {
      const callee = unwrapExpression(p.callee)
      return (
        p.callee !== outer &&
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'console' &&
        !file.referenceOf(callee.object)?.binding
      )
    }
    case 'ExpressionStatement':
    case 'UnaryExpression':
    case 'BinaryExpression':
    case 'SwitchCase':
      return true
    case 'TemplateLiteral':
      return file.parentOf(p)?.type !== 'TaggedTemplateExpression'
    case 'SwitchStatement':
      return p.discriminant === outer
    case 'IfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'ForStatement':
      return p.test === outer
    default:
      return false
  }
}

/** An isomorphic fn or a middleware with a `.client()` and no `.server()` (`createClientOnlyFn` is the API for client-only code). */
export function isClientOnlyPartial(v: AbstractValue): boolean {
  return (
    (v.t === 'isoFn' || v.t === 'builder') &&
    v.links.some((l) => l.method === 'client') &&
    !v.links.some((l) => l.method === 'server')
  )
}

interface PrefetchOptions {
  table: RecognizerTable
  late?: boolean
}

/**
 * Resolves the Start values of this module's imports. Only imports with a
 * value reference are followed (a type-only or unreferenced import carries
 * nothing); namespace imports resolve the member names the module reads.
 */
export async function prefetchStartValues(
  t0: ModuleAnalysis,
  ctx: PrefetchContext,
  opts: PrefetchOptions,
): Promise<StartPrefetch> {
  const { table } = opts
  const values = new Map<string, AbstractValue>()
  const namespaceEscapes: Array<NamespaceEscape> = []
  const lateExports: Array<Range> = []
  let relevant = false
  const file = t0.file
  // settled values only: two of this module's imports may lead to one export at once
  const memo = new Map<string, AbstractValue>()

  /** The value of `name` exported by `canonicalId`, reduced; cycles → unknown. */
  const exportValue = async (
    canonicalId: string,
    name: string,
    path: LookupPath,
  ): Promise<AbstractValue> => {
    if (isKnownSpecifier(table, canonicalId)) {
      return recognizeImport(table, canonicalId, name)
    }
    const key = importKey(canonicalId, name)
    const hit = memo.get(key)
    if (hit) {
      return hit
    }
    // The `Route` of a route file the registry lists as made by the router
    // package's constructor (the generator checked the callee's binding) is
    // a route, never a Start value: answered from the registry entry, a
    // dependency of this plan, instead of the file's summary (the route tree
    // imports every route; reading them all gave it nothing but this).
    if (name === 'Route') {
      const routes = ctx.host.routes
      const filePath = identify(canonicalId).path
      if (routes?.lookup(filePath)?.routerConstructor) {
        ctx.ledger.record({
          kind: 'route-registry',
          path: filePath,
          digest: routes.digestFor(filePath),
        })
        memo.set(key, UNKNOWN)
        return UNKNOWN
      }
    }
    const inner = path.enter(key)
    if (!inner) {
      return UNKNOWN
    }
    let value = UNKNOWN
    const outcome = await ctx.resolver.resolve(canonicalId, name)
    if (outcome.k === 'found') {
      const owner = outcome.origin.canonicalId
      value = stampSites(await reduce(outcome.value, owner, inner), owner)
    }
    if (!inner.tainted) {
      memo.set(key, value)
    }
    return value
  }

  /** Resolves `specifier` as imported by `owner` and reads `name` of it. */
  const importedValue = async (
    owner: string,
    specifier: string,
    name: string,
    path: LookupPath,
  ): Promise<AbstractValue> => {
    if (isKnownSpecifier(table, specifier)) {
      return recognizeImport(table, specifier, name)
    }
    const target = await ctx.resolveFrom(specifier, owner)
    if (target === null) {
      return UNKNOWN
    }
    return exportValue(target, name, path)
  }

  /** Reduces a summary term of module `owner` with the transfer function. */
  const reduce = async (
    v: AbstractValue,
    owner: string,
    path: LookupPath,
  ): Promise<AbstractValue> => {
    switch (v.t) {
      case 'importRef':
        return importedValue(owner, v.specifier, v.name, path)
      case 'namespace': {
        if (isKnownSpecifier(table, v.specifier)) {
          return v
        }
        // a namespace of a project module, named by its module: it leaves `owner`
        const target = await ctx.resolveFrom(v.specifier, owner)
        return target === null ? UNKNOWN : { t: 'namespace', specifier: target }
      }
      case 'member': {
        const obj = await reduce(v.object, owner, path)
        if (obj.t === 'namespace' && !isKnownSpecifier(table, obj.specifier)) {
          return exportValue(obj.specifier, v.name, path)
        }
        return applyMember(table, obj, v.name)
      }
      case 'call': {
        const callee = await reduce(v.callee, owner, path)
        const args: Array<AbstractValue | null> = []
        for (const a of v.args) {
          args.push(a === null ? null : await reduce(a, owner, path))
        }
        return applyCall(table, callee, () => args, v.site)
      }
      case 'join':
        return joinValues(
          await reduce(v.a, owner, path),
          await reduce(v.b, owner, path),
        )
      case 'function':
        return {
          t: 'function',
          returns: await reduce(v.returns, owner, path),
        }
      case 'isoFn':
        return v.returns
          ? { ...v, returns: await reduce(v.returns, owner, path) }
          : v
      default:
        return v
    }
  }

  /** An export of `id` (or of a namespace it exports) that server code can still be attached to. A dependency's are not followed. */
  const openExport = async (
    id: string,
    seen: Set<string>,
  ): Promise<string | null> => {
    if (seen.has(id) || NODE_MODULES_RE.test(id)) {
      return null
    }
    seen.add(id)
    if (isKnownSpecifier(table, id)) {
      return takesServerCode(table, { t: 'namespace', specifier: id })
        ? id
        : null
    }
    const summary = await ctx.resolver.summary(id)
    for (const name of Object.keys(summary?.exports ?? {})) {
      const v = await exportValue(id, name, LookupPath.start())
      const open = takesServerCode(table, v)
        ? name
        : v.t === 'namespace' && (await openExport(v.specifier, seen))
      if (open) {
        return open
      }
    }
    for (const star of summary?.stars ?? []) {
      const target = await ctx.resolveFrom(star, id)
      const open = target !== null && (await openExport(target, seen))
      if (open) {
        return open
      }
    }
    return null
  }

  /**
   * Follows the reads `nodes` of the namespace object of project module `id`,
   * whose members this module keys by `specifier`: members read by name are
   * prefetched, a namespace among them followed the same way; anywhere else,
   * what the namespace exports is beyond this compile, which refuses an open
   * builder among its exports.
   */
  const followNamespace = async (
    specifier: string,
    id: string,
    nodes: ReadonlyArray<Node>,
  ) => {
    const escapes = async (target: string, at: Node) => {
      const exported = await openExport(target, new Set())
      if (exported !== null) {
        namespaceEscapes.push({
          range: { start: at.start, end: at.end },
          exported,
        })
        relevant = true
      }
    }
    const member = async (name: string, at: Node) => {
      const v = await exportValue(id, name, LookupPath.start())
      values.set(importKey(specifier, name), v)
      if (isStartValue(table, v)) {
        relevant = true
      } else if (v.t === 'namespace') {
        await (at.type === 'Property'
          ? escapes(v.specifier, at)
          : followNamespace(v.specifier, v.specifier, [at]))
      }
    }
    const reads: Array<Promise<void>> = []
    for (const node of nodes) {
      let outer = node
      let parent = file.parentOf(outer)
      while (parent && isExpressionWrapper(parent)) {
        outer = parent
        parent = file.parentOf(outer)
      }
      if (!parent) {
        continue
      }
      if (
        parent.type === 'MemberExpression' &&
        parent.object === outer &&
        !parent.computed &&
        parent.property.type === 'Identifier'
      ) {
        reads.push(member(parent.property.name, parent))
      } else if (
        parent.type === 'JSXMemberExpression' &&
        parent.object === outer
      ) {
        reads.push(member(parent.property.name, parent))
      } else if (
        parent.type === 'VariableDeclarator' &&
        parent.init === outer &&
        parent.id.type === 'ObjectPattern'
      ) {
        // `const { a, 'b': c } = ns`: the destructured names; a rest element, a default or a nested pattern escapes
        for (const prop of parent.id.properties) {
          const key =
            prop.type === 'Property' && prop.value.type === 'Identifier'
              ? staticPropertyKey(prop)
              : null
          reads.push(key !== null ? member(key, prop) : escapes(id, prop))
        }
      } else if (
        // (an exported namespace is followed by the summaries)
        parent.type !== 'ExportSpecifier' &&
        parent.type !== 'ExportDefaultDeclaration' &&
        !isPlainRead(file, parent, outer)
      ) {
        reads.push(escapes(id, outer))
      }
    }
    await Promise.all(reads)
  }

  const judgeLateExports = async () => {
    const self = ctx.identity.canonicalId
    const summary = buildSummary(t0, table)
    const open = async (v: AbstractValue) =>
      takesServerCode(table, v) ||
      (v.t === 'namespace' &&
        (await openExport(v.specifier, new Set())) !== null)
    for (const e of t0.exports) {
      const fact = 'name' in e ? summary.exports[e.name] : undefined
      const start = LookupPath.start()
      const v =
        fact?.kind === 'local'
          ? await reduce(fact.value, self, start)
          : fact?.kind === 'reExport'
            ? await importedValue(self, fact.specifier, fact.fromName, start)
            : e.kind === 'star' || e.kind === 'namespace'
              ? await reduce(
                  { t: 'namespace', specifier: e.specifier },
                  self,
                  start,
                )
              : UNKNOWN
      if (await open(v)) {
        lateExports.push(e.range)
        relevant = true
      }
    }
  }

  const work: Array<Promise<void>> = []
  const prefetchImport = async (
    specifier: string,
    name: string,
    refs: ReadonlyArray<{ node: Node }>,
  ) => {
    const v = await importedValue(
      ctx.identity.canonicalId,
      specifier,
      name,
      LookupPath.start(),
    )
    values.set(importKey(specifier, name), v)
    if (isStartValue(table, v)) {
      relevant = true
    } else if (v.t === 'namespace') {
      await followNamespace(
        v.specifier,
        v.specifier,
        refs.map((r) => r.node),
      )
    }
  }
  const prefetchNamespace = async (
    specifier: string,
    refs: ReadonlyArray<{ node: Node }>,
  ) => {
    const id = await ctx.resolveFrom(specifier, ctx.identity.canonicalId)
    if (id !== null) {
      await followNamespace(
        specifier,
        id,
        refs.map((r) => r.node),
      )
    }
  }
  for (const imp of t0.imports) {
    if (imp.typeOnly || imp.bare) {
      continue
    }
    const known = isKnownSpecifier(table, imp.specifier)
    for (const spec of imp.specifiers) {
      if (spec.typeOnly || spec.local < 0) {
        continue
      }
      const binding = file.bindings[spec.local]
      if (!binding) {
        continue
      }
      const refs = binding.references.filter((r) => !r.inTypePosition)
      if (refs.length === 0) {
        continue
      }
      if (spec.imported === '*') {
        if (known) {
          relevant = true
        } else {
          work.push(prefetchNamespace(imp.specifier, refs))
        }
        continue
      }
      if (known) {
        const v = recognizeImport(table, imp.specifier, spec.imported)
        if (v.t !== 'unknown') {
          relevant = true
        }
        continue
      }
      work.push(prefetchImport(imp.specifier, spec.imported, refs))
    }
  }
  if (opts.late) {
    work.push(judgeLateExports())
  }
  await Promise.all(work)
  // (their order is the order the lookups settled in)
  namespaceEscapes.sort((a, b) => a.range.start - b.range.start)
  return { values, relevant, namespaceEscapes, lateExports }
}

/** The `resolveImport` callback of the local value analysis over a prefetch result. */
export function importResolverOf(
  prefetch: StartPrefetch | undefined,
): (specifier: string, name: string) => AbstractValue {
  return (specifier, name) =>
    prefetch?.values.get(importKey(specifier, name)) ?? UNKNOWN
}
