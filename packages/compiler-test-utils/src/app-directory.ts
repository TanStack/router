/**
 * Where the test apps live: each in a new directory of the system's
 * temporary directory, never in the repository. What a test or a tool run on
 * its app writes (dependency caches, build output, generated files, what a
 * dev server still writes after it closed) lands outside the packages.
 *
 * An app stands in for an app created in a directory of the repository
 * (`dir`, e.g. a package's `tests/`), where the harnesses created them
 * before. The apps of `dir` share a directory that mirrors the path of `dir`
 * from the outermost `node_modules` above it (the repository's root): an app
 * is as deep below the mirrored root as it was below the repository's, and
 * gets what an app in `dir` reads above itself, nothing else of the
 * repository:
 * - its bare imports resolve as from `dir`: each `node_modules` directory
 *   above `dir` is linked at its mirrored place. Node, Vite, Rspack, webpack
 *   and esbuild resolve through the links to the same real paths, so an app
 *   gets the packages it got in `dir`, each once;
 * - its TypeScript files compile with the compiler options of `dir` (the
 *   nearest `tsconfig.json` above `dir`, which Vite, Oxc and esbuild read for
 *   class fields, JSX and decorators), unless the app has a `tsconfig.json`
 *   of its own;
 * - an app without a `package.json` of its own (the harnesses write one)
 *   gets the module type and side effects of the nearest one above `dir`
 *   (`type`, `sideEffects`);
 * - a Vite dev server of the app serves what Vite serves for an app in `dir`
 *   (`servedDirectories`).
 * No configuration file of another tool is above the repository's packages.
 *
 * A Vite dev server or build of an app without a `package.json` of its own
 * needs a `cacheDir` in the app: Vite's default is the `node_modules/.vite`
 * of the nearest `package.json`, which is then the shared directory's, in
 * the linked `node_modules`.
 *
 * The shared directories are in this run's directory (`./run-directory`),
 * which the run removes when it ends; or without it in the system's
 * temporary directory, removed when their test process exits normally.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { mkdtemp, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runDirectoryVariable } from './run-directory'

interface StandIn {
  /** The directory the apps stand in for. */
  dir: string
  /** The shared directory (removed with the run, or when the process exits). */
  base: string
  /** Where the apps are created. */
  apps: string
}

/** One registry per process, whichever copy of this module runs. */
const registryKey = Symbol.for('@tanstack/compiler-test-utils/app-directory')
const registry = ((globalThis as Record<symbol, unknown>)[registryKey] ??=
  new Map<string, StandIn>()) as Map<string, StandIn>

function standIn(dir: string): StandIn {
  const resolved = path.resolve(dir)
  let found = registry.get(resolved)
  if (!found) {
    // Without a run directory, this process removes the shared directories
    // when it exits. With one, the run's teardown removes them with the run
    // directory: one owner, since removing a tree while another process
    // removes part of it can leave the rest behind (`fs.rmSync` returns
    // early when an entry vanishes under it).
    if (
      registry.size === 0 &&
      process.env[runDirectoryVariable] === undefined
    ) {
      process.once('exit', () => {
        for (const { base } of registry.values()) {
          // (removes the links, not what they point to)
          rmSync(base, { recursive: true, force: true })
        }
      })
    }
    /** The directories above `dir` (itself included) with `node_modules`. */
    const levels = ancestors(resolved).filter((level) =>
      existsSync(path.join(level, 'node_modules')),
    )
    const top = levels.at(-1) ?? resolved
    const base = mkdtempSync(
      path.join(
        process.env[runDirectoryVariable] ?? realpathSync(os.tmpdir()),
        'apps-',
      ),
    )
    /** The place of a directory of the repository in the mirror. */
    const mirrored = (directory: string) => {
      const relative = path.relative(top, directory)
      return relative === '..' || relative.startsWith(`..${path.sep}`)
        ? base
        : path.join(base, relative)
    }
    const apps = mirrored(resolved)
    mkdirSync(apps, { recursive: true })
    for (const level of levels) {
      mkdirSync(mirrored(level), { recursive: true })
      linkDirectorySync(
        path.join(level, 'node_modules'),
        path.join(mirrored(level), 'node_modules'),
      )
    }
    const tsconfig = nearest(resolved, 'tsconfig.json')
    if (tsconfig) {
      writeFileSync(
        path.join(mirrored(path.dirname(tsconfig)), 'tsconfig.json'),
        `${JSON.stringify({ extends: tsconfig, include: ['**/*'] }, null, 2)}\n`,
      )
    }
    const packageJson = nearest(resolved, 'package.json')
    if (packageJson) {
      const { type, sideEffects } = JSON.parse(
        readFileSync(packageJson, 'utf8'),
      ) as Record<string, unknown>
      writeFileSync(
        path.join(mirrored(path.dirname(packageJson)), 'package.json'),
        `${JSON.stringify({ private: true, type, sideEffects }, null, 2)}\n`,
      )
    }
    found = { dir: resolved, base, apps }
    registry.set(resolved, found)
  }
  return found
}

/**
 * The kind of link `linkDirectory` makes on this platform: a symbolic link
 * where the process may create one, else (Windows without the privilege)
 * a junction. Windows resolves a relative symbolic link reached through a
 * junction against the junction's own path, not its target's, so a
 * junction to a `node_modules` whose package links are relative (pnpm's
 * workspace links, where it could create symbolic links) leads nowhere:
 * `existsSync`, Node's and Vite's resolvers all miss the packages. A
 * symbolic link is followed like the package manager's own. pnpm picks the
 * same way (a symbolic link, a junction when it cannot), so what the app
 * links matches what the links below it need.
 */
let linkType: 'dir' | 'junction' = 'dir'

function withoutPrivilege(error: unknown): boolean {
  return (
    process.platform === 'win32' &&
    (error as NodeJS.ErrnoException).code === 'EPERM' &&
    linkType === 'dir'
  )
}

/**
 * Links directory `target` at `link` the way the package manager links
 * packages (see `linkType`): the app resolves its bare imports through it
 * as from `target`'s place.
 */
export function linkDirectorySync(target: string, link: string): void {
  try {
    symlinkSync(target, link, linkType)
  } catch (error) {
    if (!withoutPrivilege(error)) {
      throw error
    }
    linkType = 'junction'
    symlinkSync(target, link, linkType)
  }
}

/** `linkDirectorySync`, asynchronously. */
export async function linkDirectory(
  target: string,
  link: string,
): Promise<void> {
  try {
    await symlink(target, link, linkType)
  } catch (error) {
    if (!withoutPrivilege(error)) {
      throw error
    }
    linkType = 'junction'
    await symlink(target, link, linkType)
  }
}

/** `dir` and the directories above it, innermost first. */
function ancestors(dir: string): Array<string> {
  const all = [dir]
  while (path.dirname(all.at(-1)!) !== all.at(-1)) {
    all.push(path.dirname(all.at(-1)!))
  }
  return all
}

function nearest(dir: string, name: string): string | undefined {
  return ancestors(dir)
    .map((level) => path.join(level, name))
    .find((file) => existsSync(file))
}

/**
 * Creates an empty app directory, named `prefix` and a random suffix, that
 * stands in for an app created in `dir` (see the module comment). The caller
 * removes it.
 */
export function createAppDirectory(
  dir: string,
  prefix: string,
): Promise<string> {
  return mkdtemp(path.join(standIn(dir).apps, prefix))
}

/**
 * The directories a Vite dev server of the app at `root` serves files from
 * (`server.fs.allow`). For an app of `createAppDirectory(dir)`: the apps of
 * `dir`, and what Vite allows for an app in `dir` (the workspace root of
 * `dir`), where the packages the app imports really are. For another app,
 * Vite's default.
 */
export async function servedDirectories(root: string): Promise<Array<string>> {
  // (Vite only where a dev server runs: the build harness loads it lazily)
  const { searchForWorkspaceRoot } = await import('vite')
  const resolved = path.resolve(root)
  const owner = [...registry.values()].find(({ base }) =>
    resolved.startsWith(base + path.sep),
  )
  return owner
    ? [owner.base, searchForWorkspaceRoot(owner.dir)]
    : [searchForWorkspaceRoot(resolved)]
}
