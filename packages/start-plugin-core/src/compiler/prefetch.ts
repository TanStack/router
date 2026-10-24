/**
 * Phase A of the Start planners (DESIGN §3.10.1, §2.9.3): the abstract value
 * of every import this module may use as a Start value, resolved through
 * the raw-domain summaries of the modules it imports (never through the
 * bundler's transform pipeline, D4). Known packages answer by specifier.
 * Symbolic terms of a summary (`importRef`, `member`, `call`) are reduced
 * with the core's transfer function once their imports are known.
 */
import {
  UNKNOWN,
  applyCall,
  applyMember,
  isKnownSpecifier,
  recognizeImport,
  stampSites,
} from '@tanstack/router-utils/compiler'
import type {
  AbstractValue,
  ModuleAnalysis,
  PrefetchContext,
  RecognizerTable,
  YukuNode as Node,
} from '@tanstack/router-utils/compiler'

/** Phase A result: `${specifier}\0${name}` → value, for this module's imports. */
export interface StartPrefetch {
  values: Map<string, AbstractValue>
  /** Whether any import carries a Start value (the async half of the gate). */
  relevant: boolean
}

export function importKey(specifier: string, name: string): string {
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

export interface PrefetchOptions {
  table: RecognizerTable
  /** Whether a resolved id is opaque (an undiscovered package): its summary is never read. */
  isOpaque: (resolvedCanonicalId: string) => boolean
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
  const memo = new Map<string, Promise<AbstractValue>>()
  const active = new Set<string>()

  /** The value of `name` exported by `canonicalId`, reduced; cycles → unknown. */
  const exportValue = (
    canonicalId: string,
    name: string,
  ): Promise<AbstractValue> => {
    const key = importKey(canonicalId, name)
    let p = memo.get(key)
    if (!p) {
      p = (async () => {
        if (active.has(key)) {
          return UNKNOWN
        }
        active.add(key)
        try {
          if (isKnownSpecifier(table, canonicalId)) {
            return recognizeImport(table, canonicalId, name)
          }
          if (opts.isOpaque(canonicalId)) {
            return UNKNOWN
          }
          const outcome = await ctx.resolver.resolve(
            canonicalId,
            name,
            ctx.env.conditions,
          )
          if (outcome.k !== 'found') {
            return UNKNOWN
          }
          const owner = outcome.origin.canonicalId
          const reduced = await reduce(outcome.value, owner)
          return stampSites(reduced, owner)
        } finally {
          active.delete(key)
        }
      })()
      memo.set(key, p)
    }
    return p
  }

  /** Resolves `specifier` as imported by `owner` and reads `name` of it. */
  const importedValue = async (
    owner: string,
    specifier: string,
    name: string,
  ): Promise<AbstractValue> => {
    if (isKnownSpecifier(table, specifier)) {
      return recognizeImport(table, specifier, name)
    }
    const target = await ctx.resolveFrom(specifier, owner)
    if (target === null) {
      return UNKNOWN
    }
    return exportValue(target, name)
  }

  /** Reduces a summary term of module `owner` with the transfer function. */
  const reduce = async (
    v: AbstractValue,
    owner: string,
  ): Promise<AbstractValue> => {
    switch (v.t) {
      case 'importRef':
        return importedValue(owner, v.specifier, v.name)
      case 'namespace':
        if (isKnownSpecifier(table, v.specifier)) {
          return v
        }
        // a namespace of a project module: its members are resolved on demand (member terms)
        return v
      case 'member': {
        const obj = await reduce(v.object, owner)
        if (obj.t === 'namespace' && !isKnownSpecifier(table, obj.specifier)) {
          return importedValue(owner, obj.specifier, v.name)
        }
        return applyMember(table, obj, v.name)
      }
      case 'call': {
        const callee = await reduce(v.callee, owner)
        const args: Array<AbstractValue | null> = []
        for (const a of v.args) {
          args.push(a === null ? null : await reduce(a, owner))
        }
        return applyCall(table, callee, () => args, v.site)
      }
      case 'function':
        return {
          t: 'function',
          returns:
            v.returns.t === 'param'
              ? v.returns
              : await reduce(v.returns, owner),
        }
      default:
        return v
    }
  }

  const work: Array<Promise<void>> = []
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
          }
        }
        for (const name of names) {
          work.push(
            (async () => {
              const v = await importedValue(
                ctx.identity.canonicalId,
                imp.specifier,
                name,
              )
              values.set(importKey(imp.specifier, name), v)
              if (isStartValue(table, v)) {
                relevant = true
              }
            })(),
          )
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
      work.push(
        (async () => {
          const v = await importedValue(
            ctx.identity.canonicalId,
            imp.specifier,
            spec.imported,
          )
          values.set(importKey(imp.specifier, spec.imported), v)
          if (isStartValue(table, v)) {
            relevant = true
          }
        })(),
      )
    }
  }
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
