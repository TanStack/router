/** Helpers of the webpack-family loaders (router and Start). */
import remapping from '@jridgewell/remapping'
import { FlattenMap } from '@jridgewell/trace-mapping'
import { normalizePath } from '../identity'
import type { SectionedSourceMapInput } from '@jridgewell/trace-mapping'
import type { RawSourceMap } from '../output-builder'
import type { RecordMapText } from './emitted-maps'

/**
 * The module id of a webpack / Rspack `resource`, slashes normalized. The
 * bundlers escape a `#` of the file path in `resource` (webpack as `\0#`,
 * Rspack as `\u200b#`; `resourcePath` is unescaped), so that their request
 * parsing reads it as a fragment only when meant as one: a project path with
 * a `#` (`C#`, `project #2`) must give the file's path. A fragment (an
 * unescaped `#`, last: `./x.ts#a`) names no other source: dropped.
 */
export function webpackResourceId(resource: string): string {
  const fragment = resource.search(/(?<![\0\u200b])#/)
  const id = fragment === -1 ? resource : resource.slice(0, fragment)
  return normalizePath(id.replace(/[\0\u200b]#/g, '#'))
}

/**
 * A loader's output map: the compiler's map naming the module's absolute
 * path (`resourcePath`), composed with the input map (an earlier loader's
 * map is not lost, an index map included); without one, the file's text is in the map or, with a
 * recorder, in the emitted maps (`emittedMapTexts`).
 */
export function composeLoaderMap(
  map: RawSourceMap | null,
  resourcePath: string,
  source: string,
  inputMap: unknown,
  recordMapText: RecordMapText | null,
): unknown {
  if (!map) {
    return undefined
  }
  const ours = { ...map, sources: [resourcePath] }
  if (!inputMap) {
    if (recordMapText) {
      recordMapText(resourcePath, source)
      return ours
    }
    return { ...ours, sourcesContent: [source] }
  }
  const parsed = (
    typeof inputMap === 'string' ? JSON.parse(inputMap) : inputMap
  ) as object
  // an index map (`sections`) is flattened first: remapping reads plain maps
  const input =
    'sections' in parsed
      ? new FlattenMap(parsed as SectionedSourceMapInput)
      : parsed
  const composed = remapping(
    [ours as unknown as Parameters<typeof remapping>[0], input] as never,
    () => null,
  )
  return JSON.parse(composed.toString())
}
