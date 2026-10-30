/**
 * Built workspace packages for the test apps: the real `@tanstack/*`
 * packages of this repository (`packages/<dir>`), as an installed app gets
 * them. A test app under a package's `tests/` directory resolves that
 * package's own dependencies through Node resolution (e.g. the routers,
 * which are dependencies of the compiler packages); a package the owner
 * cannot depend on (e.g. `@tanstack/react-start`, which depends on
 * `@tanstack/start-plugin-core`) is linked into the app's `node_modules`
 * instead (`workspacePackageLinks`, `linkWorkspacePackages`).
 *
 * Every function checks that the package is built (its entry exists in
 * `dist`): the tests run through Nx, whose targets build the packages the
 * project depends on (`^build`); a package outside the project's
 * dependencies needs a task-level `dependsOn` on its `build` target.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { mkdir, symlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository's `packages/` directory. */
const packagesDir = fileURLToPath(new URL('../..', import.meta.url))

/** Absolute root of each workspace package by name (`packages/*`). */
let index: Map<string, string> | undefined

function workspacePackages(): Map<string, string> {
  if (!index) {
    index = new Map()
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      const root = path.join(packagesDir, entry.name)
      const manifest = path.join(root, 'package.json')
      if (!existsSync(manifest)) {
        continue
      }
      const { name } = JSON.parse(readFileSync(manifest, 'utf8')) as {
        name?: string
      }
      if (name) {
        index.set(name, root)
      }
    }
  }
  return index
}

/** The first file of a package's `exports` (or its `module`/`main`). */
function entryFile(manifest: Record<string, unknown>): string | undefined {
  const first = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
      return value
    }
    if (value && typeof value === 'object') {
      for (const inner of Object.values(value)) {
        const found = first(inner)
        if (found) {
          return found
        }
      }
    }
    return undefined
  }
  return (
    (manifest.module as string | undefined) ??
    (manifest.main as string | undefined) ??
    first(manifest.exports)
  )
}

/**
 * Absolute root of the built workspace package `name` (e.g.
 * `@tanstack/react-start` -> `packages/react-start`). Throws when the
 * package does not exist or is not built.
 */
export function workspacePackage(name: string): string {
  const root = workspacePackages().get(name)
  if (!root) {
    throw new Error(
      `${name} is no workspace package (none of ${packagesDir} has that name)`,
    )
  }
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as Record<string, unknown>
  const entry = entryFile(manifest)
  if (!entry || !existsSync(path.join(root, entry))) {
    throw new Error(
      `${name} is not built (no ${entry ?? 'entry'} in ${root}): run the tests through Nx, with a target that depends on ${name}:build`,
    )
  }
  return root
}

/**
 * Symbolic links (`AppOptions.symlinks` of the build and dev-server
 * harnesses) that give an app the built workspace packages `names`:
 * `node_modules/<name>` is the workspace package, so the app bundles and
 * runs the built package with its own export conditions, and the package's
 * dependencies resolve from its real path, as in an installed app.
 */
export function workspacePackageLinks(
  names: ReadonlyArray<string>,
): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => [`node_modules/${name}`, workspacePackage(name)]),
  )
}

/**
 * Creates the links of `workspacePackageLinks(names)` under `root`, for an
 * app made without the harnesses' `createApp`.
 */
export async function linkWorkspacePackages(
  root: string,
  names: ReadonlyArray<string>,
): Promise<void> {
  for (const [link, target] of Object.entries(workspacePackageLinks(names))) {
    await mkdir(path.dirname(path.join(root, link)), { recursive: true })
    await symlink(target, path.join(root, link))
  }
}
