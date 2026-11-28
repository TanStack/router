/**
 * TEMPORARY WORKAROUND of Rspack's lazy compilation, upstream:
 * https://github.com/web-infra-dev/rspack/issues/16594 (repro:
 * https://github.com/Sheraff/rspack-lazy-self-accept-import), fixed in
 * Rspack 2.3.3. Remove this module, its uses in `hmr.ts`, the router
 * plugin's `chunkImporterCall` (planners/split.ts) and their tests once the
 * supported Rsbuild range starts at a release with that Rspack.
 *
 * Reason: with lazy compilation on (Rsbuild's dev default), a module that
 * accepts its own updates and is loaded with `import()` evaluates again on
 * each edit, but every later `import()` of it keeps resolving to its first
 * namespace. solid-refresh makes every Solid split chunk accept its own
 * updates, so a split chunk imported again (a loader the route's refresh
 * re-runs, a lazy wrapper re-importing after a route update) would serve its
 * first evaluation's code.
 *
 * Scope: Solid, webpack-style hosts (Rsbuild, Rspack, webpack), development
 * on the client. Each evaluation of a split chunk hands its exports over
 * (`__tsrRouteChunkHmr`); the importer of the chunk's group, wrapped by the
 * compiler (`__tsrChunkImporter`), answers the newest of them once its
 * import settled.
 */
import { isServer } from '@tanstack/router-core/isServer'

// Per route file and split chunk, the exports of the chunk's newest
// evaluation. Bounded by the number of split chunks; a route file no
// router holds a route of is forgotten (`forgetChunkExports`).
const newest = new Map<string, Map<string, Record<string, any>>>()

/** Records one evaluation of a split chunk (its exports). */
export function recordChunkExports(
  file: string,
  chunk: string,
  exports: Record<string, any>,
): void {
  if (process.env.NODE_ENV !== 'production') {
    if (isServer ?? typeof window === 'undefined') {
      return
    }
    let chunks = newest.get(file)
    if (!chunks) {
      chunks = new Map()
      newest.set(file, chunks)
    }
    chunks.set(chunk, exports)
  }
}

/** Forgets the chunks of a route id the router no longer holds. */
export function forgetChunkExports(file: string): void {
  newest.delete(file)
}

/**
 * The importer of a split chunk's group: runs `importer`, then answers the
 * exports of the chunk's newest evaluation (none recorded: what the import
 * answered).
 *
 * Called only by compiler output; not a public API.
 */
export function __tsrChunkImporter(
  file: string,
  chunk: string,
  importer: () => Promise<any>,
): () => Promise<any> {
  return () =>
    importer().then((module) => newest.get(file)?.get(chunk) ?? module)
}
