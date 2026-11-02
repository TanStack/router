import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const BUILT_SCRIPT_RE = /\.c?js$/

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
    const dist = path.join(path.dirname(manifest), 'dist')
    const scripts = readdirSync(dist, { recursive: true, encoding: 'utf8' })
      .filter((file) => BUILT_SCRIPT_RE.test(file))
      .sort()
    for (const script of scripts) {
      hash.update(script)
      hash.update(readFileSync(path.join(dist, script)))
    }
  }
  return hash.digest('hex').slice(0, 16)
}
