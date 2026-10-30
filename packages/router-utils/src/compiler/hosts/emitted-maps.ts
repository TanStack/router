/**
 * Where the webpack-family hosts put the text of the files they compile:
 * in each module's map, or in the map files the devtool emits.
 *
 * Rspack and webpack hash a module with its source map, and the compiler's
 * map names the whole file. Its text in the map of every output of the file
 * (the route module, its split chunks, its Hydrate chunks) makes an edit
 * anywhere in the file change all of them: the hot update carries all of
 * them where only the edited output changed (the route module refreshing
 * its route). So in development, when the devtool writes map files, the
 * module maps name the file without its text (the devtool never reads it
 * from disk) and the text goes into the map files once the hashes are
 * computed: those are what a debugger reads. Otherwise (production, or maps
 * inside the code: `eval-*`, `inline-*`) the module maps carry the text.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** A source map as the devtool emits it (the fields read here). */
export interface EmittedSourceMap {
  sources?: Array<string | null>
  sourcesContent?: Array<string | null>
  sourceRoot?: string
}

/** The file a source of an emitted map names: `webpack://<namespace>/` names resolve from the compiler's context, other relative names from the map's directory. */
function fileOf(source: string, context: string, mapDir: string): string {
  const name = source.replace(/[?#].*$/, '')
  const namespace = /^webpack:\/\/[^/]*\//.exec(name)
  if (namespace) {
    return path.resolve(context, name.slice(namespace[0].length))
  }
  if (name.startsWith('file:')) {
    return fileURLToPath(name)
  }
  return path.resolve(mapDir, name)
}

/**
 * Gives each source of `map` that has no text the text `textOf` gives for
 * its file (a normalized path), if any. Returns the files it gave a text.
 */
export function fillSourcesContent(
  map: EmittedSourceMap,
  textOf: (file: string) => string | undefined,
  context: string,
  mapDir: string,
): Array<string> {
  const filled: Array<string> = []
  if (map.sourceRoot) {
    return filled
  }
  const sources = map.sources ?? []
  let content = map.sourcesContent
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    if (!source || content?.[i]) {
      continue
    }
    const file = path.normalize(fileOf(source, context, mapDir))
    const text = textOf(file)
    if (text === undefined) {
      continue
    }
    content ??= sources.map(() => null)
    content[i] = text
    filled.push(file)
  }
  if (filled.length > 0) {
    map.sourcesContent = content
  }
  return filled
}

/** What `emittedMapTexts` uses of a webpack / Rspack compiler. */
export interface EmittedMapsCompilerLike {
  context: string
  options: { devtool?: unknown }
  webpack: {
    Compilation: { PROCESS_ASSETS_STAGE_DEV_TOOLING: number }
    sources: { RawSource: new (source: Buffer) => unknown }
  }
  /** The files a watch compilation found deleted (set when `watchRun` runs). */
  removedFiles?: ReadonlySet<string>
  hooks: {
    thisCompilation: {
      tap: (
        name: string,
        fn: (compilation: EmittedMapsCompilationLike) => void,
      ) => void
    }
    watchRun: {
      tap: (name: string, fn: () => void) => void
    }
  }
}

interface EmittedMapsCompilationLike {
  outputOptions: { path?: string }
  hooks: {
    processAssets: {
      tap: (
        options: { name: string; stage: number },
        fn: (assets: Record<string, { source: () => unknown }>) => void,
      ) => void
    }
  }
  updateAsset: (name: string, source: never) => void
}

/** Records the text of a compiled file (its absolute path) for the emitted maps. */
export type RecordMapText = (file: string, text: string) => void

/**
 * Development with a devtool writing map files: fills them with the text
 * of the files the loader records, unless the devtool keeps sources out
 * (`nosources-*`), and returns the recorder. A module the persistent cache
 * restored was not compiled by this process: its file, unchanged since,
 * is read once, and used when the host compiles it (`compiles`). A map
 * whose JSON and texts did not change since the last compilation (most of
 * them, after an edit) gets its last filled form again, a buffer (Rspack
 * copies a string source into its own memory). Otherwise null: the module
 * maps carry the text.
 */
export function emittedMapTexts(
  compiler: EmittedMapsCompilerLike,
  mode: 'dev' | 'build',
  compiles: (file: string, text: string) => boolean,
): RecordMapText | null {
  const devtool = compiler.options.devtool
  if (
    mode !== 'dev' ||
    typeof devtool !== 'string' ||
    !devtool.includes('source-map') ||
    /eval|inline/.test(devtool)
  ) {
    return null
  }
  if (devtool.includes('nosources')) {
    return () => {}
  }
  /** By normalized path; null: not a file the host compiles. A deleted file's goes. */
  const texts = new Map<string, string | null>()
  compiler.hooks.watchRun.tap('tanstack:emitted-maps', () => {
    for (const file of compiler.removedFiles ?? []) {
      texts.delete(path.normalize(file))
    }
  })
  const textOf = (file: string): string | undefined => {
    let text = texts.get(file)
    if (text === undefined) {
      try {
        text = fs.readFileSync(file, 'utf8')
      } catch {
        text = null
      }
      if (text !== null && !compiles(file, text)) {
        text = null
      }
      texts.set(file, text)
    }
    return text ?? undefined
  }
  /** The last compilation's fill of each map: its JSON, the texts it got by file, the filled source (null: none). */
  let fills = new Map<
    string,
    { raw: string; used: Map<string, string>; filled: unknown }
  >()
  const { Compilation, sources } = compiler.webpack
  compiler.hooks.thisCompilation.tap('tanstack:emitted-maps', (compilation) => {
    compilation.hooks.processAssets.tap(
      {
        name: 'tanstack:emitted-maps',
        stage: Compilation.PROCESS_ASSETS_STAGE_DEV_TOOLING + 1,
      },
      (assets) => {
        const outDir = compilation.outputOptions.path ?? compiler.context
        const next: typeof fills = new Map()
        for (const name of Object.keys(assets)) {
          if (!name.endsWith('.map')) {
            continue
          }
          const raw = String(assets[name]!.source())
          let fill = fills.get(name)
          if (
            fill?.raw !== raw ||
            [...fill.used].some(([file, text]) => textOf(file) !== text)
          ) {
            const map = JSON.parse(raw) as EmittedSourceMap
            const files = fillSourcesContent(
              map,
              textOf,
              compiler.context,
              path.dirname(path.join(outDir, name)),
            )
            fill = {
              raw,
              used: new Map(files.map((file) => [file, textOf(file)!])),
              filled:
                files.length > 0
                  ? new sources.RawSource(Buffer.from(JSON.stringify(map)))
                  : null,
            }
          }
          next.set(name, fill)
          if (fill.filled) {
            compilation.updateAsset(name, fill.filled as never)
          }
        }
        fills = next
      },
    )
  })
  return (file, text) => {
    texts.set(path.normalize(file), text)
  }
}
