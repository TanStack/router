/**
 * Recipe renderer: walks an `OutputRecipe` against the
 * source text and drives the `OutputBuilder`. Emission is on demand and the
 * module never ends inside a line comment it did not end in already.
 */
import { OutputBuilder } from './output-builder'
import { specifierLiteral } from './strings'
import type { RawSourceMap, SourceText } from './output-builder'
import type { OutputRecipe, Segment } from './plan'

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
  /** Whether the output ends with the source's own end (it then ends as the source does). */
  let sourceEnd = false
  for (const seg of recipe.segments) {
    if (seg.k === 'slice') {
      if (seg.end > seg.start) {
        b.copy(seg.start, seg.end)
        sourceEnd = seg.end === source.code.length
      }
    } else if (seg.text.length > 0) {
      b.text(seg.text, seg.mapTo)
      sourceEnd = false
    }
  }
  if (!sourceEnd) {
    b.newline()
  }
  return b.finish()
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
