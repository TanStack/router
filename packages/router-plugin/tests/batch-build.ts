/**
 * One production build of several one-route apps (a group of cases of a
 * test file), each case still run on its own: case `i`'s route at
 * `routes/c<i>.tsx` (its `createFileRoute('/')` becomes `/c<i>`), its other
 * files under `c<i>/`, its entry at `c<i>/entry.ts`, which the app's entry
 * imports on demand (`export const c<i> = () => import('./c<i>/entry')`).
 * A run loads its case's entry only, in a process or page of its own (as
 * `BuildResult.run`): a case that throws when its modules load fails its
 * own row. A build that fails names the case whose file it reported, so
 * one case the bundler rejects fails every row of the group with that
 * case's name.
 *
 * Cases are written as one-route apps (`routeApp`): imports of `../<file>`
 * in the route and of `./routes/index` in the entry and the other files are
 * rewritten to the case's own paths (`require('../…')` too).
 */
import { onFileFinished } from '@tanstack/compiler-test-utils/test-scope'
import { build, rootRoute } from './build-harness'
import type {
  BuildResult,
  Chunk,
  Placement,
} from '@tanstack/compiler-test-utils/build-harness'

export interface BatchCase {
  /** The case's name in a failed build's message (its row's title). */
  name: string
  /** `routes/index.tsx` of the one-route app (one `createFileRoute('/')`). */
  route: string
  /** `entry.ts` of the one-route app. */
  entry: string
  /** The app's other files, by path relative to its root. */
  files?: Record<string, string>
}

export interface CaseApp {
  /** `BuildResult.run` on the case's entry (`entry` in `script`). */
  run: BuildResult['run']
  /**
   * `BuildResult.where` from the case's entry: `eager` when a chunk that
   * loads with the case's entry chunk holds `marker`, `lazy` when only
   * chunks it loads on demand do (other cases' chunks never count).
   */
  where: (marker: string | RegExp) => Placement
  /** The whole build. */
  build: BuildResult
  /**
   * The chunks the case's entry loads, with it or on demand (its entry
   * chunk first): the case's whole output, whatever other cases emitted.
   */
  chunks: Array<Chunk>
  /** The case's route file, relative to the app root (`routes/c<i>.tsx`). */
  file: string
  /** The route file's text as the build read it (its path and imports rewritten). */
  route: string
}

type BuildOptions = Omit<Parameters<typeof build>[0], 'files'> & {
  /** The root route (default React's). */
  root?: string
}

/** The text of case `i`'s marker, in its entry. */
const caseMark = (i: number) => `BATCH_CASE_${i}_END`

function caseFiles(c: BatchCase, i: number): Record<string, string> {
  const id = `c${i}`
  if (c.route.split("createFileRoute('/')").length !== 2) {
    throw new Error(`batch case "${c.name}": one createFileRoute('/') expected`)
  }
  const toRoute = (text: string) =>
    text.replaceAll(/(['"])\.\/routes\/index\1/g, `$1../routes/${id}$1`)
  const files: Record<string, string> = {
    [`routes/${id}.tsx`]: c.route
      .replace("createFileRoute('/')", `createFileRoute('/${id}')`)
      .replaceAll(
        /(from\s+|import\(\s*|require\(\s*)(['"])\.\.\//g,
        `$1$2../${id}/`,
      ),
    [`${id}/entry.ts`]: `${toRoute(c.entry)}\nexport const batchCase = '${caseMark(i)}'\n`,
  }
  for (const [name, text] of Object.entries(c.files ?? {})) {
    files[`${id}/${name}`] = toRoute(text)
  }
  return files
}

/**
 * The build of `cases` with `options` (as `build` takes them), built when a
 * row first asks for its case (`caseApp(c)`) and disposed of when the test
 * file ended.
 */
export function batchBuild(
  options: BuildOptions,
  cases: ReadonlyArray<BatchCase>,
): (c: BatchCase) => Promise<CaseApp> {
  let built: Promise<BuildResult> | undefined
  const make = async () => {
    const { root = rootRoute, ...rest } = options
    const files: Record<string, string> = { 'routes/__root.tsx': root }
    cases.forEach((c, i) => Object.assign(files, caseFiles(c, i)))
    files['entry.ts'] = cases
      .map((_, i) => `export const c${i} = () => import('./c${i}/entry')\n`)
      .join('')
    let app: BuildResult
    try {
      app = await build({
        ...rest,
        // Files outlive the row that built them; the file's end disposes
        registerCleanup: undefined,
        files,
      })
    } catch (error) {
      const message = String((error as Error).message)
      // (by the source paths the error names: the route file or a file
      // under the case's directory, never an emitted chunk's name)
      const named = cases.flatMap((c, i) =>
        new RegExp(`(?:routes[\\\\/]c${i}\\.tsx|[\\\\/]c${i}[\\\\/])`).test(
          message,
        )
          ? [`"${c.name}" (routes/c${i}.tsx)`]
          : [],
      )
      throw new Error(
        `the shared ${options.bundler} build of ${cases.length} cases failed${
          named.length > 0
            ? ` in ${named.join(', ')}`
            : ` (no case named in its error; cases: ${cases.map((c, i) => `c${i} "${c.name}"`).join(', ')})`
        }:\n${message}`,
        { cause: error },
      )
    }
    onFileFinished(() => app.dispose())
    return app
  }
  return async (c) => {
    const i = cases.indexOf(c)
    if (i < 0) {
      throw new Error(`batch case "${c.name}" is not in its group`)
    }
    built ??= make()
    const app = await built
    const groupImports =
      options.bundler === 'webpack' || options.bundler === 'rspack'
    const byName = new Map(app.chunks.map((chunk) => [chunk.fileName, chunk]))
    const own = app.chunks.filter((chunk) => chunk.code.includes(caseMark(i)))
    /**
     * The chunks loading with `fileName`. Vite: its static imports,
     * transitively (real edges). webpack and Rspack: `imports` are the
     * other chunks of the chunk's groups (`chunksOfStats`), one level: a
     * chunk two cases' groups share (a vendor chunk) lists both cases'
     * chunks, so it is never expanded.
     */
    const loadedWith = (fileName: string, into: Set<string>) => {
      if (into.has(fileName)) {
        return
      }
      into.add(fileName)
      for (const imported of byName.get(fileName)?.imports ?? []) {
        if (groupImports) {
          into.add(imported)
        } else {
          loadedWith(imported, into)
        }
      }
    }
    const loaded = new Set<string>()
    own.forEach((chunk) => loadedWith(chunk.fileName, loaded))
    // Every chunk the case loads, with its entry or on demand (other cases'
    // chunks hold their own copies of a shared marker text): webpack and
    // Rspack follow the dynamic imports of the chunks the case loads on
    // demand only (a shared chunk's children are other cases' too)
    const reachable = new Set<string>()
    const loads = (fileName: string) => {
      if (reachable.has(fileName)) {
        return
      }
      const group = new Set<string>()
      loadedWith(fileName, group)
      group.forEach((member) => reachable.add(member))
      for (const member of groupImports ? [fileName] : group) {
        for (const next of byName.get(member)?.dynamicImports ?? []) {
          loads(next)
        }
      }
    }
    own.forEach((chunk) => loads(chunk.fileName))
    const file = `routes/c${i}.tsx`
    return {
      build: app,
      chunks: [...reachable].map((fileName) => byName.get(fileName)!),
      file,
      route: caseFiles(c, i)[file]!,
      run: (script = '') =>
        app.run(
          `const caseEntry = await entry.c${i}()\nreturn await (async (entry) => { ${script} })(caseEntry)`,
        ),
      where: (marker) => {
        if (own.length === 0) {
          throw new Error(`batch case "${c.name}": no chunk holds its entry`)
        }
        const holders = app.chunks
          .filter((chunk) =>
            typeof marker === 'string'
              ? chunk.code.includes(marker)
              : marker.test(chunk.code),
          )
          .map((chunk) => chunk.fileName)
          .filter((fileName) => reachable.has(fileName))
        const eager = holders.some((fileName) => loaded.has(fileName))
        const lazy = holders.some((fileName) => !loaded.has(fileName))
        if (eager && lazy) {
          return 'eager+lazy'
        }
        if (eager) {
          return 'eager'
        }
        return lazy ? 'lazy' : 'nowhere'
      },
    }
  }
}

/**
 * A group of cases registered while the test file is collected: `add(c)`
 * at describe level returns the row's `CaseApp` getter; the group's build
 * (`batchBuild` of every case added) starts at the first row's call.
 */
export function batchCases(
  options: BuildOptions,
): (c: BatchCase) => () => Promise<CaseApp> {
  const cases: Array<BatchCase> = []
  let caseApp: ((c: BatchCase) => Promise<CaseApp>) | undefined
  return (c) => {
    if (caseApp) {
      throw new Error(`batch case "${c.name}" added after its group built`)
    }
    cases.push(c)
    return () => (caseApp ??= batchBuild(options, cases))(c)
  }
}
