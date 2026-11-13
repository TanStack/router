/**
 * The server-code check (R132): no output of a client compile holds text the
 * planners' recognisers call server-only (a server fn's handler or
 * validator, a middleware's `.server()` implementation or validator, an
 * isomorphic fn's `.server()` implementation, a `createServerOnlyFn` body; a
 * route option in `deleteNodes`).
 *
 * What it is: a redundancy net under the planners. Each planner that has
 * server-only text says what it is with its `Planner.serverCode` recorder,
 * which reads the planner's own recognition (Start's analysis, the router's
 * recognised route options) and nothing the planner decided: the analysis
 * says what is server-only, the planner what replaces it, and this module
 * compares the two on the emitted segments, the derived outputs included
 * (a slice of the source over a recorded range, or text standing for
 * source inside one: a reference rendered for its output). Positions, not
 * strings, so formatting and identical text elsewhere play no part.
 *
 * Why it exists: a planner that skips a recognised site (a `continue`
 * between recognition and erasure, an edit scoped to one output while
 * another renders the text) would otherwise ship server code silently. It
 * cannot see recognition failures (a builder the analysis does not follow),
 * declarations only server code reads, imports of server-only modules or
 * route options the router cannot read. A compile that already holds an
 * error is not checked: it fails anyway (a refused chain keeps its text).
 * A hit fails the module: an error in users' runs, a throw under the
 * self-checks.
 *
 * It is meant to be removed a couple of months after the release, once the
 * compiler's exhaustiveness is trusted (nothing left for it to catch in
 * users' reports). It costs about 1.5 % of a React client compile (a second
 * route recognition per client route module).
 *
 * How to remove it, in one deletion: this module and its tests
 * (`tests/server-code.test.ts`), its call in `pipeline.ts`,
 * `Planner.serverCode` (`host.ts`), the `ServerOnlyText` export of
 * `index.ts` and its paragraph in `README.md`; then the recorders and their
 * one-line hooks: `start-plugin-core/src/planners/server-code.ts`
 * (`startEnvPlanner`) and `router-plugin/src/planners/server-code.ts`
 * (`routerPlanner`), and the check's error rows
 * (`start-plugin-core/tests/planners/route-server-options.test.ts`).
 * `start-plugin-core/tests/integration/start-build-server-code-check-unchecked.test.ts`
 * stays (the client holds none of the text, check or no check): only its
 * header comment names the check. No planner reads anything of it.
 */
import { SELF_CHECKS } from './self-checks'
import type { Diagnostic } from './diagnostics'
import type { Planner } from './host'
import type { EmitPlan, EnvInfo, OutputRecipe, PlanContext } from './plan'
import type { Range } from './header'

/** Server-only source text of a client compile (`Planner.serverCode`). */
export interface ServerOnlyText {
  range: Range
  /** What the text is, for the message ("the server function's handler"). */
  subject: string
}

/**
 * Checks every output of a client compile's `plan` against the server-only
 * text its planners' recorders find (each reads its planner's view of the
 * final plan, `contextOf`; what it reports is dropped): a hit throws under
 * the self-checks, else adds an error for the module (`tag` with its space,
 * `file` as messages name it), one per recorded text.
 */
export function checkServerCode(
  planners: ReadonlyArray<Planner>,
  contextOf: (planner: Planner) => PlanContext,
  plan: EmitPlan,
  env: EnvInfo,
  canonicalId: string,
  tag: string,
  file: string,
): void {
  if (
    env.type !== 'client' ||
    plan.diagnostics.some((d) => d.severity === 'error')
  ) {
    return
  }
  const texts: Array<ServerOnlyText> = []
  for (const p of planners) {
    if (p.serverCode) {
      texts.push(
        ...p.serverCode({
          ...contextOf(p),
          diagnostic: () => {},
          liveDiagnostic: () => {},
        }),
      )
    }
  }
  if (texts.length === 0) {
    return
  }
  // the recorded ranges as sorted disjoint spans (texts nest: a nested
  // server fn's handler inside an outer one's), searched per segment
  const sorted = [...texts].sort(
    (a, b) => a.range.start - b.range.start || b.range.end - a.range.end,
  )
  const starts: Array<number> = []
  const ends: Array<number> = []
  for (const { range } of sorted) {
    const last = ends.length - 1
    if (last >= 0 && range.start < ends[last]!) {
      ends[last] = Math.max(ends[last]!, range.end)
    } else {
      starts.push(range.start)
      ends.push(range.end)
    }
  }
  const overlaps = (start: number, end: number): boolean => {
    // the last span starting before `end`
    let lo = 0
    let hi = starts.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (starts[mid]! < end) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    return lo > 0 && ends[lo - 1]! > start
  }
  const reported = new Set<ServerOnlyText>()
  for (const recipe of Object.values(plan.outputs)) {
    for (const seg of recipe.segments) {
      let start: number
      let end: number
      if (seg.k === 'slice') {
        start = seg.start
        end = seg.end
      } else if (seg.mapTo !== undefined) {
        start = seg.mapTo
        end = start + 1
      } else {
        continue
      }
      if (end <= start || !overlaps(start, end)) {
        continue
      }
      const text = sorted.find(
        (t) => t.range.start < end && t.range.end > start,
      )!
      if (reported.has(text)) {
        continue
      }
      reported.add(text)
      const id = recipe.derivedId ?? canonicalId
      if (SELF_CHECKS) {
        throw new Error(
          `server code in a client output: ${id} holds ${text.subject} [${text.range.start}, ${text.range.end}) at [${start}, ${end})`,
        )
      }
      plan.diagnostics.push(
        serverCodeDiagnostic(
          tag,
          file,
          outputName(recipe, canonicalId, file),
          text,
        ),
      )
    }
  }
}

/** An output as messages name it: the file, with a derived output's query. */
function outputName(
  recipe: OutputRecipe,
  canonicalId: string,
  file: string,
): string {
  const id = recipe.derivedId
  if (id === null) {
    return file
  }
  return id.startsWith(canonicalId) ? file + id.slice(canonicalId.length) : id
}

function serverCodeDiagnostic(
  tag: string,
  file: string,
  output: string,
  text: ServerOnlyText,
): Diagnostic {
  return {
    severity: 'error',
    message: `${tag}Internal compiler error in ${file}: ${text.subject} would be included in the client output ${output}, so the build stops. Please report it at https://github.com/TanStack/router/issues with this file.`,
    range: text.range,
    by: 'core',
    code: 'server-code-in-client',
  }
}
