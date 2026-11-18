/**
 * Determinism versus relocation (SPEC G4, J1.5, J4.4, J5.4, §9).
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
 * optional implementation control, outside the compiler tests.
 *
 * - Determinism: with the same effective root and configuration, repeated
 *   runs and runs that differ only in incidental order (file discovery,
 *   request order, write order) give the same observable output: ids,
 *   module graph, diagnostics.
 * - Relocation: the same project at another root must compile correctly
 *   and agree with itself (callers and providers share ids within a
 *   build), but opaque ids and bytes need not equal those of the other
 *   root. `expectRelocatable` checks each root on its own and compares
 *   only a `portable` projection the test chooses (route ids and paths,
 *   rendered output), never opaque ids.
 * - Edits change the input: nothing is required to stay stable across an
 *   edit (J4.4), so the helper takes none.
 *
 * API:
 * - `expectRelocatable(roots, observe, { check, portable? })`: runs
 *   `observe` at each root, applies `check(observation, root)` to each and,
 *   when given, asserts `portable(observation, root)` agrees across roots.
 */
import { expect } from 'vitest'

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
