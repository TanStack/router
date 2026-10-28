/**
 * Recipe renderer: walks an `OutputRecipe` against the
 * source text and drives the `OutputBuilder`. Emission is on demand and the
 * module never ends inside a line comment it did not end in already.
 */
import { OutputBuilder } from './output-builder'
import { specifierLiteral } from './strings'
import type { RawSourceMap, SourceText } from './output-builder'
import type { EdgeRecord, OutputRecipe, Segment } from './plan'

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

/**
 * Replaces an edge's specifier literals with a new one (phase C
 * substitution): the generated segments carrying its key, and the source
 * literals at its locations, cut out of the slice holding them.
 */
export function substituteSpecifier(
  recipe: OutputRecipe,
  edge: EdgeRecord,
  specifier: string,
  code: string,
): void {
  const { edgeKey } = edge
  const segments = recipe.segments
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    if (seg.k === 'text' && seg.edgeKey === edgeKey) {
      segments[i] = {
        k: 'text',
        text: specifierLiteral(specifier, seg.text),
        mapTo: seg.mapTo,
        edgeKey,
      }
    }
  }
  for (const loc of edge.locations) {
    if (!('range' in loc)) {
      continue
    }
    const { start, end } = loc.range
    const i = segments.findIndex(
      (s) => s.k === 'slice' && s.start <= start && s.end >= end,
    )
    if (i === -1) {
      continue
    }
    const s = segments[i]! as Extract<Segment, { k: 'slice' }>
    const parts: Array<Segment> = []
    if (s.start < start) {
      parts.push({ k: 'slice', start: s.start, end: start })
    }
    parts.push({
      k: 'text',
      text: specifierLiteral(specifier, code.slice(start, end)),
      mapTo: start,
      edgeKey,
    })
    if (end < s.end) {
      parts.push({ k: 'slice', start: end, end: s.end })
    }
    segments.splice(i, 1, ...parts)
  }
}
