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
  isKnownSpecifier,
  joinValues,
  recognizeImport,
  stampSites,
  staticPropertyKey,
} from '@tanstack/router-utils/compiler'
import type {
  AbstractValue,
  ModuleAnalysis,
  PrefetchContext,
  RecognizerTable,
} from '@tanstack/router-utils/compiler'

/** Phase A result: `${specifier}\0${name}` → value, for this module's imports. */
export interface StartPrefetch {
  values: Map<string, AbstractValue>
  /** Whether any import carries a Start value (the async half of the gate). */
  relevant: boolean
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
      return v.returns.t === 'param' ? false : isStartValue(table, v.returns)
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
        v.kind === table.startKind
      )
    case 'startInstance':
      return true
    case 'builder':
      return !(
        table.terminal[v.kind] === 'middleware' &&
        v.links.some((l) => l.method === 'server')
      )
    case 'isoFn':
      return !v.links.some((l) => l.method === 'server')
    case 'namespace': {
      const exports = table.factories[v.specifier]
      return exports !== undefined
        ? Object.values(exports).some((kind) =>
            takesServerCode(table, { t: 'factory', kind }),
          )
        : false
    }
    case 'function':
      return v.returns.t !== 'param' && takesServerCode(table, v.returns)
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
      case 'namespace':
        if (isKnownSpecifier(table, v.specifier)) {
          return v
        }
        // a namespace of a project module: its members are resolved on demand (member terms)
        return v
      case 'member': {
        const obj = await reduce(v.object, owner, path)
        if (obj.t === 'namespace' && !isKnownSpecifier(table, obj.specifier)) {
          return importedValue(owner, obj.specifier, v.name, path)
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
          returns:
            v.returns.t === 'param'
              ? v.returns
              : await reduce(v.returns, owner, path),
        }
      default:
        return v
    }
  }

  const work: Array<Promise<void>> = []
  const prefetchImport = async (specifier: string, name: string) => {
    const v = await importedValue(
      ctx.identity.canonicalId,
      specifier,
      name,
      LookupPath.start(),
    )
    values.set(importKey(specifier, name), v)
    if (isStartValue(table, v)) {
      relevant = true
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
          continue
        }
        const names = new Set<string>()
        for (const r of refs) {
          const parent = file.parentOf(r.node)
          if (!parent) {
            continue
          }
          if (
            parent.type === 'MemberExpression' &&
            parent.object === r.node &&
            !parent.computed &&
            parent.property.type === 'Identifier'
          ) {
            names.add(parent.property.name)
          } else if (
            parent.type === 'JSXMemberExpression' &&
            parent.object === r.node
          ) {
            names.add(parent.property.name)
          } else if (
            parent.type === 'VariableDeclarator' &&
            parent.init === r.node &&
            parent.id.type === 'ObjectPattern'
          ) {
            // `const { a, 'b': c } = ns`: the destructured names
            for (const prop of parent.id.properties) {
              const key = prop.type === 'Property' && staticPropertyKey(prop)
              if (key) {
                names.add(key)
              }
            }
          }
        }
        for (const name of names) {
          work.push(prefetchImport(imp.specifier, name))
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
      work.push(prefetchImport(imp.specifier, spec.imported))
    }
  }
  // a Start package loaded at run time: the client compile reports it
  relevant ||= t0.dynamicEdges.some(
    (e) =>
      isKnownSpecifier(table, e.specifier) &&
      takesServerCode(table, { t: 'namespace', specifier: e.specifier }),
  )
  await Promise.all(work)
  return { values, relevant }
}

/** The `resolveImport` callback of the local value analysis over a prefetch result. */
export function importResolverOf(
  prefetch: StartPrefetch | undefined,
): (specifier: string, name: string) => AbstractValue {
  return (specifier, name) =>
    prefetch?.values.get(importKey(specifier, name)) ?? UNKNOWN
}
