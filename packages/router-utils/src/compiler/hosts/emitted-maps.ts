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
 * computed: those are what a debugger reads. Otherwise (production, maps
 * inside the code: `eval-*`, `inline-*`, or a file whose source name the
 * fill cannot turn back into it) the module maps carry the text.
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
 * Whether the source the devtool names `file` (a normalized absolute path)
 * with `template` (an `output.devtool[Fallback]ModuleFilenameTemplate`;
 * none: the bundler's default) is a name `fileOf` turns back into it, from
 * a map in the output directory and from one below it. A function gets the
 * paths the bundler gives it, a string its placeholders (an unknown one
 * stays, and the name names no file; `[relative-resource-path]` is relative
 * to the map). What the loader does not know of the module (its hash, id,
 * query and loaders) the template gets as `0` or empty: a template naming
 * the file by those is not followed.
 */
function namesRoundTrip(
  template: unknown,
  context: string,
  outDir: string,
  file: string,
): boolean {
  if (template === undefined) {
    return true
  }
  const posix = (p: string) => p.split(path.sep).join('/')
  // (as webpack shortens a path: `./` unless it leaves the context)
  const fromContext = posix(path.relative(context, file))
  const relative = fromContext.startsWith('../')
    ? fromContext
    : `./${fromContext}`
  const info: Record<string, string> = {
    identifier: file,
    shortIdentifier: relative,
    resource: relative,
    resourcePath: relative,
    absoluteResourcePath: file,
    loaders: '',
    allLoaders: '',
    query: '',
    moduleId: '0',
    hash: '0',
    namespace: 'app',
  }
  return [outDir, path.join(outDir, 'js')].every((mapDir) => {
    const placeholders: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(info).map(([key, value]) => [key.toLowerCase(), value]),
      ),
      absresourcepath: file,
      id: info.moduleId!,
      relativeresourcepath: posix(path.relative(mapDir, file)),
    }
    try {
      const name =
        typeof template === 'function'
          ? (template as (info: Record<string, string>) => unknown)(info)
          : typeof template === 'string'
            ? template.replace(
                /\[([\w-]+)\]/g,
                (whole, key: string) =>
                  placeholders[key.toLowerCase().replaceAll('-', '')] ?? whole,
              )
            : null
      return (
        typeof name === 'string' &&
        path.normalize(fileOf(name, context, mapDir)) === file
      )
    } catch {
      return false
    }
  })
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
  options: {
    devtool?: unknown
    output: {
      path?: string
      devtoolModuleFilenameTemplate?: unknown
      devtoolFallbackModuleFilenameTemplate?: unknown
    }
  }
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
  chunks: Iterable<{
    hash?: string | null
    files: Iterable<string>
    auxiliaryFiles: Iterable<string>
  }>
  getAsset: (
    name: string,
  ) =>
    | { info: { related?: { sourceMap?: string | Iterable<string> | null } } }
    | undefined
    | void
  hooks: {
    processAssets: {
      tap: (
        options: { name: string; stage: number },
        fn: (assets: Record<string, { source: () => unknown }>) => void,
      ) => void
    }
  }
  updateAsset: (
    name: string,
    source: never,
    info?: (info: { version?: string }) => { version?: string },
  ) => void
}

/**
 * Records the text of a compiled file (its absolute path) for the emitted
 * maps; false: they will not find the file (its module map carries the
 * text).
 */
export type RecordMapText = (file: string, text: string) => boolean

/**
 * Development with a devtool writing map files: fills them with the text
 * of the files the loader records, unless the devtool keeps sources out
 * (`nosources-*`), and returns the recorder. A module the persistent cache
 * restored was not compiled by this process: its file, unchanged since,
 * is read once, and used when the host compiles it (`compiles`). The map
 * of a chunk whose hash and texts did not change since the last compilation
 * (most of them, after an edit) gets its last filled form again without
 * being read (the chunk hashes its modules' maps with their code), a buffer
 * (Rspack copies a string source into its own memory). `fill` false:
 * nothing reads the map files' text (Start's server environment in Rsbuild
 * dev, kept in memory), so they are left without it, as under
 * `nosources-*`. Otherwise null: the module maps carry the text. The
 * recorder declines a file whose source name does not lead back to it (an
 * app's `devtoolModuleFilenameTemplate`: `namesRoundTrip`), as the fill
 * finds a file by its name. The maps are the ones the devtool records on
 * the assets they map (`info.related.sourceMap`): an asset of the app may
 * end in `.map` too.
 */
export function emittedMapTexts(
  compiler: EmittedMapsCompilerLike,
  mode: 'dev' | 'build',
  compiles: (file: string, text: string) => boolean,
  fill = true,
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
  if (!fill || devtool.includes('nosources')) {
    return () => true
  }
  const { output } = compiler.options
  const roundTrips = (template: unknown, file: string) =>
    namesRoundTrip(
      template,
      compiler.context,
      output.path ?? compiler.context,
      file,
    )
  /** By normalized path; null: not a file the host compiles. A deleted file's goes. */
  const texts = new Map<string, string | null>()
  /** Whether the fill finds a file by its source names (`namesRoundTrip`), by normalized path. */
  const found = new Map<string, boolean>()
  compiler.hooks.watchRun.tap('tanstack:emitted-maps', () => {
    for (const file of compiler.removedFiles ?? []) {
      texts.delete(path.normalize(file))
      found.delete(path.normalize(file))
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
  /**
   * The last compilation's fill of each map: its chunk's hash, the texts it
   * got by file, the filled source (null: none) and the asset version it
   * sets (null: its chunk's). Rspack writes an asset again only when its
   * version changed, and a map has its chunk's: a new fill of a map whose
   * chunk is unchanged (a text changed but no code of the chunk) takes a
   * version of its own, which a reused fill keeps. Only those set one: an
   * asset whose info is updated makes Rspack's emit of the compilation
   * slower (20-50 ms on a medium app when the entry chunk's map is among
   * them, Rspack 2.3.1), and a new chunk hash is a new version already.
   */
  let fills = new Map<
    string,
    {
      chunkHash: string | undefined
      used: Map<string, string>
      filled: unknown
      version: string | null
    }
  >()
  let fillCount = 0
  const { Compilation, sources } = compiler.webpack
  /** The last compilation's chunks by hash: their files and their maps. */
  let chunks = new Map<string, { files: Array<string>; maps: Array<string> }>()
  compiler.hooks.thisCompilation.tap('tanstack:emitted-maps', (compilation) => {
    const relatedMaps = (name: string): Array<string> => {
      const related = compilation.getAsset(name)?.info.related?.sourceMap
      return related == null
        ? []
        : typeof related === 'string'
          ? [related]
          : [...related]
    }
    compilation.hooks.processAssets.tap(
      {
        name: 'tanstack:emitted-maps',
        stage: Compilation.PROCESS_ASSETS_STAGE_DEV_TOOLING + 1,
      },
      (assets) => {
        const outDir = compilation.outputOptions.path ?? compiler.context
        /** The maps to fill, with their chunk's hash (none: a hot update's, read every time). */
        const maps = new Map<string, string | undefined>()
        /** The files of the chunks (their maps and assets among them). */
        const inChunks = new Set<string>()
        const nextChunks: typeof chunks = new Map()
        for (const chunk of compilation.chunks) {
          const chunkHash = chunk.hash ?? undefined
          // (a chunk keeps its files and their maps while its hash stays)
          let known =
            chunkHash === undefined ? undefined : chunks.get(chunkHash)
          if (!known) {
            const files = [...chunk.files]
            known = {
              files: [...files, ...chunk.auxiliaryFiles],
              maps: files.flatMap(relatedMaps),
            }
          }
          if (chunkHash !== undefined) {
            nextChunks.set(chunkHash, known)
          }
          for (const file of known.files) {
            inChunks.add(file)
          }
          for (const map of known.maps) {
            maps.set(map, chunkHash)
          }
        }
        chunks = nextChunks
        const emitted = new Set(Object.keys(assets))
        for (const name of emitted) {
          if (!inChunks.has(name)) {
            for (const map of relatedMaps(name)) {
              maps.set(map, undefined)
            }
          }
        }
        const next: typeof fills = new Map()
        for (const [name, chunkHash] of maps) {
          if (!emitted.has(name)) {
            continue
          }
          let fill = fills.get(name)
          if (
            chunkHash === undefined ||
            fill?.chunkHash !== chunkHash ||
            [...fill.used].some(([file, text]) => textOf(file) !== text)
          ) {
            const map = JSON.parse(
              String(assets[name]!.source()),
            ) as EmittedSourceMap
            const files = fillSourcesContent(
              map,
              textOf,
              compiler.context,
              path.dirname(path.join(outDir, name)),
            )
            fill = {
              chunkHash,
              used: new Map(files.map((file) => [file, textOf(file)!])),
              filled:
                files.length > 0
                  ? new sources.RawSource(Buffer.from(JSON.stringify(map)))
                  : null,
              version:
                chunkHash !== undefined && fill?.chunkHash === chunkHash
                  ? `~tsr${++fillCount}`
                  : null,
            }
          }
          next.set(name, fill)
          if (fill.filled) {
            const { version } = fill
            if (version === null) {
              compilation.updateAsset(name, fill.filled as never)
            } else {
              compilation.updateAsset(name, fill.filled as never, (info) => ({
                ...info,
                version,
              }))
            }
          }
        }
        fills = next
      },
    )
  })
  return (file, text) => {
    const key = path.normalize(file)
    let finds = found.get(key)
    if (finds === undefined) {
      finds =
        roundTrips(output.devtoolModuleFilenameTemplate, key) &&
        roundTrips(output.devtoolFallbackModuleFilenameTemplate, key)
      found.set(key, finds)
    }
    if (finds) {
      texts.set(key, text)
    }
    return finds
  }
}
