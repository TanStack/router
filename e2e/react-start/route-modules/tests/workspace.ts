import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Generator, getConfig } from '@tanstack/router-generator'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, '../packages')
const repoRoot = path.resolve(here, '../../../..')
/** The repository's TypeScript compiler (`tsc` of `@typescript/native`). */
const tsc = path.join(repoRoot, 'node_modules', '.bin', 'tsc')

const workspaceScope = '@start-route-modules/'
const generatedFile = /\.gen(?:\.[^.]+)?\.tsx?$/

/** The application's route modules (`vite.config.ts`). */
const routeModules = {
  includes: [
    { module: '@start-route-modules/catalog', at: '/shop' },
    { module: '@start-route-modules/notes', at: '/notes' },
    {
      module: '@start-route-modules/team',
      parent: '/orgs/$orgId',
      at: '/team',
    },
    {
      module: '@start-route-modules/settings',
      parent: '/orgs/$orgId',
      at: '/settings',
      as: 'orgSettings',
    },
    {
      module: '@start-route-modules/settings',
      parent: '/people/$personId',
      at: '/settings',
      as: 'personSettings',
    },
  ],
}

/** The route tree footer the TanStack Start plugin generates. */
const startFooter = [
  `import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}`,
]

function listDependencies(nodeModules: string): Array<string> {
  if (!existsSync(nodeModules)) {
    return []
  }
  const entries: Array<string> = []
  for (const entry of readdirSync(nodeModules)) {
    if (entry.startsWith('.')) {
      continue
    }
    if (entry.startsWith('@')) {
      for (const scoped of readdirSync(path.join(nodeModules, entry))) {
        entries.push(`${entry}/${scoped}`)
      }
    } else {
      entries.push(entry)
    }
  }
  return entries
}

/**
 * A copy of the fixture packages in a temporary directory. Workspace route
 * modules are linked to their copies; every other dependency is linked to the
 * package the repository installed. Nothing generated is copied.
 */
export class Workspace {
  readonly root: string

  constructor() {
    const dir = path.join(
      os.tmpdir(),
      `tsr-start-route-modules-${crypto.randomBytes(4).toString('hex')}`,
    )
    mkdirSync(dir, { recursive: true })
    this.root = realpathSync(dir)
    for (const name of ['catalog', 'notes', 'settings', 'team', 'web']) {
      this.addPackage(name)
    }
  }

  private addPackage(name: string) {
    const from = path.join(fixtureRoot, name)
    const to = this.pkg(name)
    cpSync(from, to, {
      recursive: true,
      filter: (file) =>
        !file.includes(`${path.sep}node_modules`) &&
        !file.includes(`${path.sep}.tanstack`) &&
        !file.includes(`${path.sep}dist`) &&
        !generatedFile.test(file),
    })
    for (const dependency of listDependencies(
      path.join(from, 'node_modules'),
    )) {
      const link = path.join(to, 'node_modules', dependency)
      mkdirSync(path.dirname(link), { recursive: true })
      const target = dependency.startsWith(workspaceScope)
        ? this.pkg(dependency.slice(workspaceScope.length))
        : realpathSync(path.join(from, 'node_modules', dependency))
      symlinkSync(target, link, 'dir')
    }
  }

  pkg(name: string) {
    return path.join(this.root, name)
  }

  edit(name: string, file: string, edit: (content: string) => string) {
    const full = path.join(this.pkg(name), file)
    const before = readFileSync(full, 'utf8')
    const after = edit(before)
    if (after === before) {
      throw new Error(`The edit of ${name}/${file} changed nothing`)
    }
    writeFileSync(full, after)
  }

  /** Generates and publishes a route module. */
  async publish(name: string) {
    const root = this.pkg(name)
    await new Generator({
      config: getConfig(
        { disableLogging: true, tmpDir: path.join(this.root, '.tmp') },
        root,
      ),
      root,
    }).run()
    const project = JSON.parse(
      readFileSync(path.join(root, 'tsconfig.route-types.json'), 'utf8'),
    )
    rmSync(
      path.resolve(
        root,
        project.compilerOptions.declarationDir ??
          project.compilerOptions.outDir,
      ),
      { recursive: true, force: true },
    )
    return this.compile(name, ['-p', 'tsconfig.route-types.json'])
  }

  /** Generates the application's route tree like the Start plugin does. */
  async generateApp() {
    const root = this.pkg('web')
    const config = getConfig(
      {
        disableLogging: true,
        tmpDir: path.join(this.root, '.tmp'),
        target: 'react',
        routeModules,
        routeTreeFileFooter: startFooter,
      },
      root,
    )
    await new Generator({ config, root }).run()
  }

  /** Type-checks the application against the published modules. */
  checkApp() {
    return this.compile('web', ['-p', 'tsconfig.json', '--noEmit'])
  }

  private compile(name: string, args: Array<string>) {
    const result = spawnSync(tsc, [...args, '--pretty', 'false'], {
      cwd: this.pkg(name),
      encoding: 'utf8',
    })
    return {
      ok: result.status === 0,
      diagnostics: result.error
        ? [result.error.message]
        : `${result.stdout ?? ''}${result.stderr ?? ''}`
            .split(/\r?\n/)
            .filter((line) => line.trim() !== ''),
    }
  }

  dispose() {
    rmSync(this.root, { recursive: true, force: true })
  }
}

/** The diagnostics of a failed check that point into `file`. */
export function errorsIn(diagnostics: Array<string>, file: string) {
  const errors: Array<string> = []
  let current: string | undefined
  for (const line of diagnostics) {
    if (/^\s/.test(line)) {
      if (current !== undefined) {
        current += `\n${line}`
      }
      continue
    }
    if (current !== undefined) {
      errors.push(current)
    }
    current =
      line.startsWith(file) || line.includes(`/${file}(`) ? line : undefined
  }
  if (current !== undefined) {
    errors.push(current)
  }
  return errors
}
