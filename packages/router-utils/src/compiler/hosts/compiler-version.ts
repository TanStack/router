import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { Hash } from 'node:crypto'
import type { Dirent } from 'node:fs'

const BUILT_SCRIPT_RE = /\.[cm]?js$/

/**
 * A key for what a bundler's persistent cache keeps of a compile, from the
 * manifests of the packages holding the compiler (their real paths): a module
 * restored from such a cache is never compiled again, so another version's
 * outputs must not be restored. The path of a package is no key (a flat
 * `node_modules` upgrades in place), and a lockfile a user's bundler does not
 * watch. A package outside `node_modules` (this repository's workspace, a
 * linked package) changes without its version: its built scripts count too.
 */
export function compilerCacheKey(manifests: ReadonlyArray<string>): string {
  const hash = createHash('sha256')
  for (const manifest of manifests) {
    hash.update(readFileSync(manifest))
    if (manifest.split(path.sep).includes('node_modules')) {
      continue
    }
    hashBuiltScripts(hash, path.join(path.dirname(manifest), 'dist'))
  }
  return hash.digest('hex').slice(0, 16)
}

function hashBuiltScripts(hash: Hash, dist: string): void {
  let entries: Array<Dirent>
  try {
    entries = readdirSync(dist, { recursive: true, withFileTypes: true })
  } catch {
    // no build (yet): the plugin running from source, a rebuild wiping it
    return
  }
  const scripts = entries
    .filter((entry) => entry.isFile() && BUILT_SCRIPT_RE.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort()
  for (const script of scripts) {
    hash.update(path.relative(dist, script))
    hash.update(readFileSync(script))
  }
}
