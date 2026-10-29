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
import { identify } from './identity'
import type { PlanKey } from './identity'

/** A compilation of the webpack family (`TModule`: its module type). */
interface RebuildCompilationLike<TModule = unknown> {
  modules: Iterable<TModule>
  rebuildModule: (
    module: TModule,
    callback: (error?: Error | null) => void,
  ) => void
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
 * Rebuilds the modules of `compilation` whose resource `paths` holds
 * (`pathOf`: a resource as `paths` spells it), in place.
 */
export async function rebuildModules<TModule>(
  compilation: RebuildCompilationLike<TModule>,
  paths: ReadonlySet<string>,
  pathOf: (resource: string) => string,
): Promise<void> {
  for (const m of compilation.modules) {
    const resource = (m as { resource?: string }).resource
    if (resource && paths.has(pathOf(resource))) {
      await new Promise<void>((resolve, reject) => {
        compilation.rebuildModule(m, (error) =>
          error ? reject(error) : resolve(),
        )
      })
    }
  }
}
