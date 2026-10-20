/**
 * Determinism versus relocation (FIX-PLAN A11; SPEC G4, J1.5, J4.4, J5.4,
 * §9).
 *
 * What is compared is a semantic projection of what the test observes,
 * never emitted bytes (SPEC §5.1, §5.5, G4): the values the compiled code
 * computes when it runs (loader data, rendered output, shared identity),
 * the lazy groups and which user modules load on demand, the relevant
 * diagnostics, and the ids that are a public contract (route ids and
 * paths, a configured id function's ids). Not emitted code or file names,
 * private and generated names (bindings, generated type names, chunk
 * names), nor complete inventories of the modules a load evaluates (a
 * generated facade or support module is free). Byte equality is at most an
 * optional implementation control, outside the corpus.
 *
 * - Determinism: with the same effective root and configuration, repeated
 *   runs and runs that differ only in incidental order (file discovery,
 *   request order, write order) give the same observable output: ids,
 *   module graph, diagnostics. `expectDeterministic` compares what the test
 *   observes across such runs.
 * - Relocation: the same project at another root must compile correctly
 *   and agree with itself (callers and providers share ids within a
 *   build), but opaque ids and bytes need not equal those of the other
 *   root. `expectRelocatable` checks each root on its own and compares
 *   only a `portable` projection the test chooses (route ids and paths,
 *   rendered output), never opaque ids.
 * - Edits change the input: nothing is required to stay stable across an
 *   edit (J4.4), so neither helper takes one.
 *
 * API:
 * - `reorderings(items)` and `reorderedRecords(record)`: the given order,
 *   the reverse, and an interleaving, as named variants.
 * - `expectDeterministic(variants, observe, { project? })`: runs `observe`
 *   once per variant, one after another, and asserts every projection
 *   (`project(observation)`, default the observation) equals the first.
 *   Returns the observations.
 * - `expectRelocatable(roots, observe, { check, portable? })`: runs
 *   `observe` at each root, applies `check(observation, root)` to each and,
 *   when given, asserts `portable(observation, root)` agrees across roots.
 * - `withoutRoot(value, root)`: `value` with every spelling of `root`
 *   (posix, Windows separators, `file://` URL) in its strings replaced by
 *   `<root>`, for portable projections of paths and diagnostics.
 */
import { pathToFileURL } from 'node:url'
import { expect } from 'vitest'

/** A named order of the same items. */
export interface Ordering<T> {
  name: string
  items: Array<T>
}

/**
 * The given order, the reverse, and an interleaving (odd positions first),
 * deduplicated when they coincide (e.g. fewer than three items).
 */
export function reorderings<T>(items: Array<T>): Array<Ordering<T>> {
  const orders: Array<Ordering<T>> = [
    { name: 'given order', items: [...items] },
    { name: 'reversed', items: [...items].reverse() },
    {
      name: 'interleaved',
      items: [
        ...items.filter((_, index) => index % 2 === 1),
        ...items.filter((_, index) => index % 2 === 0),
      ],
    },
  ]
  return orders.filter(
    (order, index) =>
      orders.findIndex(
        (other) =>
          other.items.length === order.items.length &&
          other.items.every((item, position) => item === order.items[position]),
      ) === index,
  )
}

/**
 * `reorderings` of a record's entries (e.g. app files, whose key order is
 * the order they are written in).
 */
export function reorderedRecords<T>(
  record: Record<string, T>,
): Array<Ordering<[string, T]> & { record: Record<string, T> }> {
  return reorderings(Object.entries(record)).map((order) => ({
    ...order,
    record: Object.fromEntries(order.items),
  }))
}

/**
 * Runs `observe` for each variant, one after another, and asserts the
 * projection of every observation (`project`, default the observation
 * itself) deep-equals the first one's. Variants must share the effective
 * root and configuration: only repetition or incidental order may differ.
 */
export async function expectDeterministic<TVariant, TObservation>(
  variants: Array<TVariant>,
  observe: (
    variant: TVariant,
    index: number,
  ) => TObservation | Promise<TObservation>,
  options: { project?: (observation: TObservation) => unknown } = {},
): Promise<Array<TObservation>> {
  const observations: Array<TObservation> = []
  for (const [index, variant] of variants.entries()) {
    observations.push(await observe(variant, index))
  }
  const project = options.project ?? ((observation) => observation)
  const projections = observations.map(project)
  for (const [index, projection] of projections.entries()) {
    expect(projection, `variant ${index} vs variant 0`).toEqual(projections[0])
  }
  return observations
}

/**
 * Runs `observe` at each root, one after another, and checks each
 * observation on its own (`check`: correct results, ids agreeing within
 * the build). Only `portable` projections are compared across roots.
 */
export async function expectRelocatable<TObservation>(
  roots: Array<string>,
  observe: (root: string) => TObservation | Promise<TObservation>,
  options: {
    check: (observation: TObservation, root: string) => void | Promise<void>
    portable?: (observation: TObservation, root: string) => unknown
  },
): Promise<Array<TObservation>> {
  const observations: Array<TObservation> = []
  for (const root of roots) {
    const observation = await observe(root)
    await options.check(observation, root)
    observations.push(observation)
  }
  if (options.portable) {
    const portable = observations.map((observation, index) =>
      options.portable!(observation, roots[index]!),
    )
    for (const [index, projection] of portable.entries()) {
      expect(projection, `${roots[index]} vs ${roots[0]}`).toEqual(portable[0])
    }
  }
  return observations
}

/**
 * `value` with each spelling of `root` in its strings (and object keys)
 * replaced by `<root>`.
 */
export function withoutRoot<T>(value: T, root: string): T {
  const posix = root.replaceAll('\\', '/').replace(/\/+$/, '')
  const spellings = [
    ...new Set([
      pathToFileURL(posix).href,
      posix,
      posix.replaceAll('/', '\\'),
      root.replace(/[\\/]+$/, ''),
    ]),
  ].sort((a, b) => b.length - a.length)
  // A spelling counts only where the root ends (not `/app` in `/apple`).
  const pattern = new RegExp(
    `(?:${spellings.map((spelling) => spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w.-])`,
    'g',
  )
  const replace = (text: string) => text.replace(pattern, '<root>')
  const visit = (current: unknown): unknown => {
    if (typeof current === 'string') {
      return replace(current)
    }
    if (Array.isArray(current)) {
      return current.map(visit)
    }
    if (
      typeof current === 'object' &&
      current !== null &&
      Object.getPrototypeOf(current) === Object.prototype
    ) {
      return Object.fromEntries(
        Object.entries(current).map(([key, item]) => [
          replace(key),
          visit(item),
        ]),
      )
    }
    return current
  }
  return visit(value) as T
}
