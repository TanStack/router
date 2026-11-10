/**
 * The host side of the one invalidation operation in the webpack family
 * (Rspack, webpack) for a change the bundler sees no file event for: a
 * route-registry change. `invalidate()` evicts the plans and returns them;
 * the bundler rebuilds a module only for a file event, so the host reports
 * the files concerned as changed to the watching compiler (`invalidateFiles`):
 * their modules are created again, rules re-matched (a file that was no route
 * is one now), at a compilation it starts after the running one, if any.
 * `rebuildModules` rebuilds modules of the current compilation in place
 * (same loaders), for hosts that must re-run a module's build at `finishMake`.
 */
import path from 'node:path'
import { identify } from '../identity'
import type { PlanKey } from '../identity'

/** A compilation of the webpack family (`TModule`: its module type). */
interface RebuildCompilationLike<
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

/** A compiler of the webpack family, watching or not. */
export interface WatchingCompilerLike {
  watching?:
    | {
        invalidate: (callback?: () => void) => void
        invalidateWithChangesAndRemovals?: (
          changedFiles: Set<string>,
          removedFiles: Set<string>,
          callback?: () => void,
        ) => void
      }
    | undefined
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

/**
 * Tells a watching compiler that `paths` changed (a one-shot build has
 * nothing to tell: its modules are built after the registry is published).
 */
export function invalidateFiles(
  compiler: WatchingCompilerLike,
  paths: Iterable<string>,
): void {
  const watching = compiler.watching
  if (!watching) {
    return
  }
  const changed = new Set<string>()
  for (const p of paths) {
    changed.add(path.normalize(p))
  }
  if (changed.size === 0) {
    return
  }
  if (watching.invalidateWithChangesAndRemovals) {
    watching.invalidateWithChangesAndRemovals(changed, new Set())
  } else {
    watching.invalidate()
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
