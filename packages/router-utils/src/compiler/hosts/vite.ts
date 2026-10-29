/** Helpers of the Vite hosts (router and Start). */

/**
 * Whether a Vite environment build (its `build` config) is the last one of
 * the logical build, after which `releaseEnvironment` is due: a written
 * bundle outside watch mode. A `write: false` build may be a scan that
 * builds the environment again (an RSC client scan), and a watch build
 * rebuilds it: their plans stay.
 */
export function isFinalBuild(
  build: { write?: boolean; watch?: unknown } | undefined,
): boolean {
  return build !== undefined && build.write !== false && !build.watch
}
