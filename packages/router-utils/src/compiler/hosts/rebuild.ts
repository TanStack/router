/**
 * The webpack-family (Rspack, webpack) host's side of the stale sets, shared
 * by Start's Rsbuild host and the router's host (`StaleSetDrain`): each
 * environment's compiler builds the modules of its stale set again in place
 * at `finishMake` (`rebuildModules`, same loaders: the hosts' loader rules
 * read no mutable state), in the compilation of the event; a set that fills
 * while its compiler is idle gets it a compilation.
 */
import { displayPath } from '../diagnostics'
import { identify } from '../identity'
import type { CompilerCaches } from '../host'
import type { PlanKey } from '../identity'

/** A compilation of the webpack family (`TModule`: its module type). */
export interface RebuildCompilationLike<
  TModule extends { identifier: () => string; resource?: string },
  TDependency = unknown,
> {
  modules: ReadonlySet<TModule>
  rebuildModule: (
    module: TModule,
    callback: (error?: Error | null) => void,
  ) => void
  /**
   * The modules this compilation built (webpack: a `WeakSet`, without a
   * module its snapshot found current; Rspack: a `Set`, which also lists
   * modules it did not build again).
   */
  builtModules?: { has: (module: TModule) => boolean }
  /** Rspack's compiler namespace names its version; webpack's does not. */
  compiler?: { webpack?: { rspackVersion?: string } }
  entries?: ReadonlyMap<string, { dependencies: ReadonlyArray<TDependency> }>
  moduleGraph?: { getModule: (dependency: TDependency) => TModule | null }
}

/** What the drain asks of a compiler (typed and documented on Rspack and webpack). */
export interface IdleCompilerLike {
  idle?: boolean
  watching?: { invalidate: () => void } | undefined
}

/**
 * Runs `work`, a hook of ours on a webpack-family compiler. In watch mode
 * it never rejects: a rejected hook ends the bundler's watcher (webpack's
 * and Rspack's `Watching` then neither finish the compilation nor watch
 * again, so a dev server stops answering; Rspack 2.3.1 panics at the next
 * compilation). Its failure is an error in `errors` instead (a
 * compilation's; a hook that runs before there is one, `watchRun`, gives
 * an array the host pushes into the next compilation's): the compilation
 * ends as a failed build, which the terminal and the overlay show, and
 * watching goes on. What the hook took and did not finish it gives back
 * itself (`StaleSetDrain.rebuild`). A one-shot build rejects: a fatal error
 * ends it.
 */
export async function reportingFailure(
  compiler: {
    watchMode?: boolean
    webpack?: { WebpackError?: new (message: string) => Error }
  },
  errors: Array<Error>,
  /** The host's tag and what the hook does (`Building the stale modules again`). */
  failure: { tag: string; what: string },
  work: () => Promise<void>,
): Promise<void> {
  if (!compiler.watchMode) {
    return work()
  }
  try {
    await work()
  } catch (error) {
    const WebpackError = compiler.webpack?.WebpackError ?? Error
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    errors.push(
      new WebpackError(
        `${failure.tag} ${failure.what} failed. Watching goes on, and the next change is built again.\n${detail}`,
      ),
    )
  }
}

/** The paths of plan keys (`restorePlans`' stale ones), for `env` (every environment when omitted). */
export function pathsOf(keys: Iterable<PlanKey>, env?: string): Array<string> {
  const out = new Set<string>()
  for (const key of keys) {
    if (env === undefined || key.env === env) {
      out.add(identify(key.canonicalId).path)
    }
  }
  return [...out]
}

/** How many compilations in a row `wake` asks a compiler for without a cause. */
const MAX_ASKED = 3

/**
 * The stale sets of a session's caches, taken by the webpack-family
 * compilers of its environments (one compiler per environment). A compiler
 * forwards its own file events to `invalidate()` and reports them here as a
 * cause (`caused`); the files a compilation builds from their own events
 * leave its set at `make` (`building`); the rest of the set is built at
 * `finishMake` (`rebuild`). What fills a set after its compilation's
 * `rebuild` (another environment's event, a registry change, a compile
 * overtaken) is built by another compilation (`compiled`).
 */
export class StaleSetDrain {
  /**
   * Each environment's compiler; `asked`: the compilations `wake` asked for
   * since its last cause, or since one ended with its set empty;
   * `startedBy`: the environment whose compilations start this one's.
   */
  private readonly compilers = new Map<
    string,
    { compiler: IdleCompilerLike; asked: number; startedBy?: string }
  >()
  /** By environment, the paths `building` took out of its set: built by its compilation, or by `rebuild`. */
  private readonly takenAtMake = new Map<string, Set<string>>()

  constructor(
    private readonly caches: CompilerCaches,
    /** The tag of the host's messages and the project root (`HostServices`). */
    private readonly host: { tag: string; root: string },
  ) {}

  /**
   * The compiler of an environment. `startedBy`: the environment whose
   * compilations start this one's (Rspack's RSC coordinator starts the
   * client's from the server's, and a client compilation started on its
   * own waits for the next server compilation): its set gets that
   * compiler a compilation.
   */
  register(env: string, compiler: IdleCompilerLike, startedBy?: string): void {
    this.compilers.set(env, { compiler, asked: 0, startedBy })
  }

  /** A file event of the environment's own compilation: `wake` may ask for compilations again. */
  caused(env: string): void {
    const entry = this.compilers.get(env)
    if (entry) {
      entry.asked = 0
    }
  }

  /**
   * The files a compilation of `env` builds from their own events (its
   * modified files, once every invalidation of its events ended): they
   * leave the set (what makes them stale from here on enters it again).
   * `rebuild` builds those the compilation did not (webpack with content
   * hashes in its snapshots skips a file written again unchanged).
   */
  building(env: string, files: Iterable<string>): void {
    const { stale } = this.caches
    let taken = this.takenAtMake.get(env)
    for (const file of files) {
      if (stale.holds(env, file)) {
        taken ??= new Set()
        taken.add(file)
      }
    }
    if (taken) {
      this.takenAtMake.set(env, taken)
      stale.drop(env, taken)
    }
  }

  /**
   * Builds again the modules of the environment's stale set (the held ones
   * too: a module importing a removed file fails here as it would in the
   * bundler's own rebuild), once the invalidations running (a registry
   * change published during this compilation's `watchRun`) ended, and the
   * modules of what `building` took that the compilation did not build.
   * `pathOf`: a module resource as the stale sets spell its path.
   */
  async rebuild<
    TModule extends { identifier: () => string; resource?: string },
    TDependency,
  >(
    env: string,
    compilation: RebuildCompilationLike<TModule, TDependency>,
    pathOf: (resource: string) => string,
  ): Promise<void> {
    const { caches } = this
    // the environment's compilation holds modules: a registry change stales
    // its file here whether or not a plan of it exists
    caches.stale.track(env)
    if (caches.invalidations.size > 0) {
      await caches.settled()
    }
    const paths = new Set(caches.stale.take(env, { held: true }))
    const taken = this.takenAtMake.get(env)
    this.takenAtMake.delete(env)
    if (paths.size === 0 && !taken) {
      return
    }
    const built = compilation.builtModules
    try {
      await rebuildModulesWhere(compilation, (m) => {
        if (!m.resource) {
          return false
        }
        const path = pathOf(m.resource)
        return (
          paths.has(path) ||
          (taken !== undefined && taken.has(path) && !built?.has(m))
        )
      })
    } catch (error) {
      // what this compilation was to build stays stale (held paths too, as
      // plain ones: a compiler of the webpack family takes both): the next
      // compilation builds it, which `compiled` asks for, within the bound
      for (const path of [...paths, ...(taken ?? [])]) {
        caches.stale.add(env, path)
      }
      throw error
    }
  }

  /**
   * A compilation of `env` ended (`afterDone`: in `done` the compiler is not
   * idle yet, and a compilation asked for there would start inside it): if
   * its set is empty, the compilations asked for so far did their work.
   * Then `wake`.
   */
  compiled(env: string): void {
    const entry = this.compilers.get(env)
    if (entry && !this.caches.stale.has(env)) {
      entry.asked = 0
    }
    this.wake()
  }

  /** A registry change (its files are stale in every environment that compiled): every compiler may be asked again, the idle ones now. */
  registryChanged(): void {
    for (const entry of this.compilers.values()) {
      entry.asked = 0
    }
    this.wake()
  }

  /**
   * Asks for a compilation of each environment whose stale set is not empty
   * (of the compiler that starts its compilations, `startedBy`), when that
   * compiler is idle. At most `MAX_ASKED` in a row that each end with the
   * set still not empty and no cause between: a module whose rebuild finds
   * itself stale again
   * (its plan's validation and its compile disagreeing) then waits for the
   * next event instead of compiling forever, and a warning names its files.
   */
  private wake(): void {
    for (const [env, entry] of this.compilers) {
      const starter =
        entry.startedBy === undefined
          ? entry
          : this.compilers.get(entry.startedBy)
      if (!starter?.compiler.idle || !this.caches.stale.has(env)) {
        continue
      }
      if (entry.asked < MAX_ASKED) {
        entry.asked++
        starter.compiler.watching?.invalidate()
      } else if (entry.asked === MAX_ASKED) {
        entry.asked++
        const files = this.caches.stale
          .paths(env)
          .map((file) => displayPath(file, this.host.root))
        console.warn(
          `${this.host.tag} ${files.join(', ')} ${files.length === 1 ? 'was' : 'were'} still out of date after ${MAX_ASKED} rebuilds in a row (${env}), so the dev server stops rebuilding ${files.length === 1 ? 'it' : 'them'} until a file changes. Save ${files.length === 1 ? 'the file' : 'one of them'} to build ${files.length === 1 ? 'it' : 'them'} again, and please report this to TanStack.`,
        )
      }
    }
  }
}

/**
 * First `@rspack/core` whose `rebuildModule` calls every callback
 * (web-infra-dev/rspack#16567). Unknown: still open at 2.3.2. Set it when
 * the fix ships; the tripwire test (start-plugin-core,
 * `rspack-rebuild-batch.test.ts`) goes red on the first Rspack without the
 * defect.
 */
export const RSPACK_REBUILD_CALLBACKS_FIXED_IN: string | undefined = undefined

/** Whether Rspack `version` has every `rebuildModule` callback called. */
export function rspackCallsEveryRebuildCallback(version: string): boolean {
  const fixed = RSPACK_REBUILD_CALLBACKS_FIXED_IN
  if (fixed === undefined) {
    return false
  }
  const parse = (v: string) =>
    (/^(\d+)\.(\d+)\.(\d+)/.exec(v) ?? []).slice(1).map(Number)
  const [a, b] = [parse(version), parse(fixed)]
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return (a[i] ?? 0) > (b[i] ?? 0)
    }
  }
  return true
}

/**
 * Rebuilds the modules of `compilation` whose resource `paths` holds
 * (`pathOf`: a resource as `paths` spells it), in place.
 */
export async function rebuildModules<
  TModule extends { identifier: () => string; resource?: string },
  TDependency,
>(
  compilation: RebuildCompilationLike<TModule, TDependency>,
  paths: ReadonlySet<string>,
  pathOf: (resource: string) => string,
): Promise<void> {
  return rebuildModulesWhere(
    compilation,
    (m) => m.resource !== undefined && paths.has(pathOf(m.resource)),
  )
}

/** Rebuilds the modules of `compilation` that `wanted` takes, in place. */
async function rebuildModulesWhere<
  TModule extends { identifier: () => string; resource?: string },
  TDependency,
>(
  compilation: RebuildCompilationLike<TModule, TDependency>,
  wanted: (module: TModule) => boolean,
): Promise<void> {
  const pending = [...compilation.modules].filter(wanted)
  if (pending.length === 0) {
    return
  }
  const rspack = compilation.compiler?.webpack?.rspackVersion
  if (rspack !== undefined && rspackCallsEveryRebuildCallback(rspack)) {
    await Promise.all(pending.map((m) => rebuild(compilation, m)))
    return
  }
  const lead =
    rspack === undefined || pending.length === 1
      ? undefined
      : entryModuleOf(compilation)
  if (lead !== undefined) {
    // HACK(rspack#16567): Rspack rebuilds the calls of one tick in one pass
    // (`AsyncTask` in its `Compilation`) and pairs its answer, the modules
    // that kept their identifier, with the callbacks by position: when R
    // modules left the graph or changed rule match, the last R callbacks are
    // never called. An entry module, which no rebuild removes, leads the
    // tick, so the first callback is always called, in the loop that follows
    // the whole pass. Delete with the fix (RSPACK_REBUILD_CALLBACKS_FIXED_IN)
    // for the `Promise.all` above.
    return new Promise<void>((resolve, reject) => {
      compilation.rebuildModule(lead, (error) =>
        error ? reject(error) : resolve(),
      )
      for (const m of pending) {
        if (m !== lead) {
          compilation.rebuildModule(m, () => {})
        }
      }
    })
  }
  // one pass per module, skipping one the rebuild before it removed (Rspack
  // panics on a module outside its graph; `has` asks the graph natively
  // instead of scanning it)
  for (let i = 0; i < pending.length; i++) {
    const m = pending[i]!
    if (i === 0 || compilation.modules.has(m)) {
      await rebuild(compilation, m)
    }
  }
}

function rebuild<TModule>(
  compilation: {
    rebuildModule: (m: TModule, cb: (error?: Error | null) => void) => void
  },
  m: TModule,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    compilation.rebuildModule(m, (error) => (error ? reject(error) : resolve()))
  })
}

/** A module of a file that an entry of `compilation` starts at. */
function entryModuleOf<
  TModule extends { identifier: () => string; resource?: string },
  TDependency,
>(
  compilation: RebuildCompilationLike<TModule, TDependency>,
): TModule | undefined {
  if (!compilation.entries || !compilation.moduleGraph) {
    return undefined
  }
  for (const entry of compilation.entries.values()) {
    for (const dependency of entry.dependencies) {
      const m = compilation.moduleGraph.getModule(dependency)
      if (m?.resource) {
        return m
      }
    }
  }
  return undefined
}
