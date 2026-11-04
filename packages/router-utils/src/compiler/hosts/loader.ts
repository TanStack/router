/** Helpers of the webpack-family loaders (router and Start). */
import remapping from '@jridgewell/remapping'
import { normalizePath } from '../identity'
import type { RawSourceMap } from '../output-builder'
import type { RecordMapText } from './emitted-maps'

/**
 * The module id of a webpack / Rspack `resource`, slashes normalized. The
 * bundlers escape a `#` of the file path in `resource` (webpack as `\0#`,
 * Rspack as `\u200b#`; `resourcePath` is unescaped), so that their request
 * parsing reads it as a fragment only when meant as one: a project path with
 * a `#` (`C#`, `project #2`) must give the file's path.
 */
export function webpackResourceId(resource: string): string {
  return normalizePath(resource.replace(/[\0\u200b]#/g, '#'))
}

/**
 * A loader's output map: the compiler's map naming the module's absolute
 * path (`resourcePath`), composed with the input map (an earlier loader's
 * map is not lost); without one, the file's text is in the map or, with a
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
  const input =
    typeof inputMap === 'string'
      ? (JSON.parse(inputMap) as Parameters<typeof remapping>[0])
      : (inputMap as Parameters<typeof remapping>[0])
  const composed = remapping(
    [ours as unknown as Parameters<typeof remapping>[0], input] as never,
    () => null,
  )
  return JSON.parse(composed.toString())
}
