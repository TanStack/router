/**
 * The webpack-family (Rspack, webpack) host's side of the stale sets, shared
 * by Start's Rsbuild host and the router's host (`StaleSetDrain`): each
 * environment's compiler builds the modules of its stale set again in place
 * at `finishMake` (`rebuildModules`, same loaders: the hosts' loader rules
 * read no mutable state), in the compilation of the event; a set that fills
 * while its compiler is idle gets it a compilation.
 */
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

/** The paths of the plans `invalidate()` evicted or found stale, for `env` (every environment when omitted). */
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
 * `rebuild` (another environment's event, a registry change, a compile overtaken) is
 * built by another compilation (`wake`).
 */
export class StaleSetDrain {
  /** Each environment's compiler; `asked`: the compilations `wake` asked it for since its last cause. */
  private readonly compilers = new Map<
    string,
    { compiler: IdleCompilerLike; asked: number }
  >()

  constructor(private readonly caches: CompilerCaches) {}

  /** The compiler of an environment. */
  register(env: string, compiler: IdleCompilerLike): void {
    this.compilers.set(env, { compiler, asked: 0 })
  }

  /** A file event of the environment's own compilation: `wake` may ask for compilations again. */
  caused(env: string): void {
    const entry = this.compilers.get(env)
    if (entry) {
      entry.asked = 0
    }
  }

  /**
   * The files a compilation of `env` builds now from their own events, once
   * every invalidation of its events ended: the drain needn't build them
   * again (what makes them stale from here on enters the set again).
   */
  building(env: string, files: Iterable<string>): void {
    this.caches.stale.drop(env, files)
  }

  /**
   * Builds again the modules of the environment's stale set (the held ones
   * too: a module importing a removed file fails here as it would in the
   * bundler's own rebuild), once the invalidations running (a registry
   * change published during this compilation's `watchRun`) ended. `pathOf`:
   * a module resource as the stale sets spell its path.
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
    if (caches.invalidations.size > 0) {
      await caches.settled()
    }
    const paths = caches.stale.take(env, { held: true })
    if (paths.length > 0) {
      await rebuildModules(compilation, new Set(paths), pathOf)
    }
  }

  /** A registry change (its files are stale in every environment that compiled): every compiler may be asked again, the idle ones now. */
  registryChanged(): void {
    for (const entry of this.compilers.values()) {
      entry.asked = 0
    }
    this.wake()
  }

  /**
   * Asks each idle compiler whose stale set is not empty for a compilation:
   * after every compilation (`afterDone`: in `done` the compiler is not idle
   * yet, and a compilation asked for there would start inside it) and after
   * a registry change. At most `MAX_ASKED` in a row without a cause: a module
   * whose rebuild finds itself stale again (its plan's validation and its
   * compile disagreeing) waits for the next event instead of compiling
   * forever.
   */
  wake(): void {
    for (const [env, entry] of this.compilers) {
      if (
        entry.compiler.idle &&
        entry.asked < MAX_ASKED &&
        this.caches.stale.has(env)
      ) {
        entry.asked++
        entry.compiler.watching?.invalidate()
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
  const pending = [...compilation.modules].filter(
    (m) => m.resource && paths.has(pathOf(m.resource)),
  )
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
