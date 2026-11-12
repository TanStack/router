/**
 * The server-code check (R132): no output of a compile holds text a planner
 * recorded as server-only (`RewriteSet.serverOnly`: a server fn's handler, a
 * `.server()` implementation, a `createServerOnlyFn` body, a validator, a
 * route option the router planner erases, in a client compile). It reads the emitted segments, the derived outputs
 * included: a slice of the source over a recorded range, or text standing
 * for source inside one (a reference rendered for its output). Positions,
 * not strings, so formatting and identical text elsewhere play no part.
 *
 * A safety net under the planners, not a mechanism: each recorded range is
 * also removed by the planner that records it, so the check fires only on a
 * compiler bug. It fails the module (an error in users' runs, a throw under
 * the self-checks); it can go once the compiler has no holes left for it to
 * catch.
 */
import { SELF_CHECKS } from './self-checks'
import type { Diagnostic } from './diagnostics'
import type { EmitPlan, OutputRecipe } from './plan'
import type { ServerOnlyText } from './rewrite'

/**
 * Checks every output of `plan` against `texts`: a hit throws under the
 * self-checks, else adds an error for the module (`tag` with its space,
 * `file` as messages name it), one per recorded text.
 */
export function checkServerCode(
  texts: ReadonlyArray<ServerOnlyText>,
  plan: EmitPlan,
  canonicalId: string,
  tag: string,
  file: string,
): void {
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
