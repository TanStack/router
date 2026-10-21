/**
 * Which module each position of an emitted chunk comes from, read from the
 * chunk's standard source map (`@jridgewell/trace-mapping`): the evidence
 * that attributes a read in a bundle to a module without parsing the
 * bundler's printed layout (module headers, factory wrappers), minified or
 * not (coupling N19, RULES-AUDIT R11).
 */
import path from 'node:path'

/**
 * The module (resource path) each offset of a chunk's code comes from, by
 * the chunk's source map: an absolute source (Rspack and webpack with
 * `[absolute-resource-path]`, Vite's `/@fs/` or absolute ids), or a source
 * relative to the map's directory (Rolldown). `undefined` where the map
 * names no file (runtime code, a virtual module).
 */
export async function sourceAttribution(
  code: string,
  map: {
    version: number
    sources: Array<string | null>
    names: Array<string>
    mappings: string
  },
  mapDirectory: string,
  options: {
    /**
     * What a `webpack://<namespace>/` source is relative to (the build's
     * context); default `mapDirectory`.
     */
    context?: string
  } = {},
): Promise<(offset: number) => string | undefined> {
  const { TraceMap, originalPositionFor } =
    await import('@jridgewell/trace-mapping')
  const traced = new TraceMap(map as never)
  const lineStarts = [0]
  for (let index = 0; index < code.length; index++) {
    if (code.charCodeAt(index) === 10) {
      lineStarts.push(index + 1)
    }
  }
  return (offset) => {
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (lineStarts[middle]! <= offset) {
        low = middle
      } else {
        high = middle - 1
      }
    }
    const { source } = originalPositionFor(traced, {
      line: low + 1,
      column: offset - lineStarts[low]!,
    })
    if (!source || source.startsWith('\0')) {
      return undefined
    }
    const webpackSource = /^webpack:\/\/[^/]*\//.exec(source)
    const file = source
      .slice(webpackSource ? webpackSource[0].length : 0)
      .replace(/^file:\/\//, '')
      .replace(/^\/@fs(?=\/)/, '')
      .replace(/[?#].*$/, '')
    if (path.isAbsolute(file)) {
      return file
    }
    return path.resolve(
      webpackSource ? (options.context ?? mapDirectory) : mapDirectory,
      file,
    )
  }
}
