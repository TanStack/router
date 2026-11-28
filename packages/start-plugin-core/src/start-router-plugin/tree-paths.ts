import { realpathSync } from 'node:fs'
import path from 'node:path'
import { normalizePath } from '@tanstack/router-utils/compiler'

/**
 * The paths a bundler may name the route tree module by: the configured
 * one and, when a link is on the way (a linked directory, or the tree a
 * link itself), its real path, where the bundlers resolve modules by
 * default. Forward slashes. Directories the generator has not created yet
 * are joined to the real path of the nearest one that exists (a host may
 * ask before the first generation and keep the answer).
 */
export function createTreePaths(
  treeFile: () => string,
): () => ReadonlyArray<string> {
  let known: { file: string; paths: ReadonlyArray<string> } | undefined
  return () => {
    const file = treeFile()
    if (known?.file !== file) {
      const configured = normalizePath(file)
      const real = normalizePath(realPathOf(file))
      known = {
        file,
        paths: real === configured ? [configured] : [configured, real],
      }
    }
    return known.paths
  }
}

/** The real path of `file`, through its nearest existing ancestor when it does not exist (yet). */
function realPathOf(file: string): string {
  let existing = file
  for (;;) {
    try {
      return path.join(realpathSync(existing), path.relative(existing, file))
    } catch {
      const parent = path.dirname(existing)
      if (parent === existing) {
        return file
      }
      existing = parent
    }
  }
}
