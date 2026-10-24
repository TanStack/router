/**
 * Recipe renderer (DESIGN §2.7, §3.7): walks an `OutputRecipe` against the
 * source text and drives the `OutputBuilder`. Emission is on demand and the
 * module never ends inside a line comment.
 */
import { OutputBuilder, SourceText } from './output-builder'
import { specifierLiteral } from './strings'
import type { RawSourceMap } from './output-builder'
import type { EmitPlan, OutputRecipe, Segment } from './plan'
import type { OutputId } from './rewrite'

export interface Emitted {
  code: string
  map: RawSourceMap | null
}

export function emitRecipe(
  recipe: OutputRecipe,
  source: SourceText,
  wantMap: boolean,
): Emitted {
  const b = new OutputBuilder(source, recipe.mapSource, { map: wantMap })
  for (const seg of recipe.segments) {
    if (seg.k === 'slice') {
      if (seg.end > seg.start) {
        b.copy(seg.start, seg.end)
      }
    } else {
      b.text(seg.text, seg.mapTo)
    }
  }
  b.newline()
  return b.finish()
}

export function emitOutput(
  plan: EmitPlan,
  output: OutputId,
  code: string,
  wantMap: boolean,
): Emitted | null {
  const recipe = plan.outputs[output]
  if (!recipe) {
    return null
  }
  if (code.length !== plan.sourceLength) {
    throw new Error(
      'emitOutput: the source text does not match the plan revision',
    )
  }
  return emitRecipe(recipe, new SourceText(code), wantMap)
}

/** Replaces the segment(s) carrying `edgeKey` with a new specifier literal (phase C substitution). */
export function substituteSpecifier(
  recipe: OutputRecipe,
  edgeKey: string,
  specifier: string,
  code: string,
): number {
  let n = 0
  for (let i = 0; i < recipe.segments.length; i++) {
    const seg = recipe.segments[i]!
    if (seg.edgeKey !== edgeKey) {
      continue
    }
    const original =
      seg.k === 'slice' ? code.slice(seg.start, seg.end) : seg.text
    const text = specifierLiteral(specifier, original)
    const next: Segment =
      seg.k === 'slice'
        ? { k: 'text', text, mapTo: seg.start, edgeKey }
        : { k: 'text', text, mapTo: seg.mapTo, edgeKey }
    recipe.segments[i] = next
    n++
  }
  return n
}
