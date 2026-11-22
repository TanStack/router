import { realpathSync } from 'node:fs'
import path from 'node:path'
import { normalizePath } from '@tanstack/router-utils/compiler'

/**
 * The paths a bundler may name the route tree module by: the configured
 * one and, when a link is on the way (a linked directory, or the tree a
 * link itself), its real path, where the bundlers resolve modules by
 * default. Forward slashes. The real path of the tree's directory is read
 * once it exists (the generator creates the tree file in it).
 */
export function createTreePaths(
  treeFile: () => string,
): () => ReadonlyArray<string> {
  let known: { file: string; paths: ReadonlyArray<string> } | undefined
  return () => {
    const file = treeFile()
    if (known?.file === file) {
      return known.paths
    }
    const configured = normalizePath(file)
    let real: string
    try {
      real = normalizePath(realpathSync(file))
    } catch {
      try {
        real = normalizePath(
          path.join(realpathSync(path.dirname(file)), path.basename(file)),
        )
      } catch {
        // (no directory yet: asked again next time)
        return [configured]
      }
    }
    const paths = real === configured ? [configured] : [configured, real]
    known = { file, paths }
    return paths
  }
}
