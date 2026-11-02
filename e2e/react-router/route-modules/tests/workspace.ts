import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  Generator,
  getConfig,
  readRouteModuleManifest,
} from '@tanstack/router-generator'
import type { RouteModuleManifest } from '@tanstack/router-generator'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, '../packages')
const repoRoot = path.resolve(here, '../../../..')
/** The repository's TypeScript compiler (`tsc` of `@typescript/native`). */
export const tsc = path.join(repoRoot, 'node_modules', '.bin', 'tsc')

const workspaceScope = '@route-modules/'
const generatedFile = /\.gen(?:\.[^.]+)?\.tsx?$/

export type Operation = 'generate' | 'emit-types' | 'check' | 'build'

export interface LoggedOperation {
  operation: Operation
  pkg: string
  ok: boolean
}

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
 * package the repository installed, so the copy resolves like the original.
 * Nothing generated or built is copied: every test starts from a clean
 * checkout.
 */
export class Workspace {
  readonly root: string
  readonly log: Array<LoggedOperation> = []

  constructor(
    packages: Array<string> = [
      'products',
      'storefront',
      'account',
      'team',
      'settings',
      'billing',
      'web',
    ],
  ) {
    this.root = realpathSync(
      require_mkdtemp(path.join(os.tmpdir(), 'tsr-route-modules-')),
    )
    for (const name of packages) {
      this.addPackage(name, name)
    }
  }

  /** Copies fixture package `source` as `name` into the workspace. */
  addPackage(name: string, source: string) {
    const from = path.join(fixtureRoot, source)
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

  file(name: string, file: string) {
    return path.join(this.pkg(name), file)
  }

  read(name: string, file: string) {
    return readFileSync(this.file(name, file), 'utf8')
  }

  write(name: string, file: string, content: string) {
    mkdirSync(path.dirname(this.file(name, file)), { recursive: true })
    writeFileSync(this.file(name, file), content)
  }

  edit(name: string, file: string, edit: (content: string) => string) {
    const before = this.read(name, file)
    const after = edit(before)
    if (after === before) {
      throw new Error(`The edit of ${name}/${file} changed nothing`)
    }
    this.write(name, file, after)
  }

  remove(name: string, file: string) {
    rmSync(this.file(name, file), { recursive: true, force: true })
  }

  exists(name: string, file: string) {
    return existsSync(this.file(name, file))
  }

  /** Pass A: route generation of one package. */
  async generate(name: string) {
    const packageRoot = this.pkg(name)
    const config = getConfig(
      { disableLogging: true, tmpDir: path.join(this.root, '.tmp') },
      packageRoot,
    )
    try {
      await new Generator({ config, root: packageRoot }).run()
      this.log.push({ operation: 'generate', pkg: name, ok: true })
    } catch (error) {
      this.log.push({ operation: 'generate', pkg: name, ok: false })
      throw error
    }
  }

  /** The fixture package's ordinary clean TypeScript declaration build. */
  async emitTypes(name: string) {
    const project = JSON.parse(this.read(name, 'tsconfig.route-types.json'))
    this.remove(
      name,
      project.compilerOptions.declarationDir ?? project.compilerOptions.outDir,
    )
    const result = this.compile(name, ['-p', 'tsconfig.route-types.json'])
    this.log.push({ operation: 'emit-types', pkg: name, ok: result.ok })
    return result
  }

  /** Source check of one package against current module declarations. */
  async check(name: string) {
    const result = this.compile(name, ['-p', 'tsconfig.json', '--noEmit'])
    this.log.push({ operation: 'check', pkg: name, ok: result.ok })
    return result
  }

  /** Generates, emits and checks every package in dependency order. */
  async buildGraph(order: Array<string>, modules: Array<string>) {
    for (const name of order) {
      await this.generate(name)
      if (modules.includes(name)) {
        const emitted = await this.emitTypes(name)
        if (!emitted.ok) {
          throw new Error(emitted.diagnostics.join('\n'))
        }
      }
    }
  }

  manifest(name: string): RouteModuleManifest {
    return readRouteModuleManifest(this.pkg(name))!
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

  /** Content hash and modification time of every file below `dir`. */
  snapshot(name: string, dir: string): Record<string, string> {
    const base = this.file(name, dir)
    const result: Record<string, string> = {}
    const walk = (current: string) => {
      for (const entry of readdirSync(current)) {
        const full = path.join(current, entry)
        const stat = statSync(full)
        if (stat.isDirectory()) {
          walk(full)
        } else {
          result[path.relative(base, full)] = `${crypto
            .createHash('sha256')
            .update(readFileSync(full))
            .digest('hex')
            .slice(0, 12)}@${stat.mtimeMs}`
        }
      }
    }
    if (existsSync(base)) {
      walk(base)
    }
    return result
  }

  /** The files a package's type check loads (`tsc --listFilesOnly`). */
  listProgramFiles(name: string): Array<string> {
    const result = spawnSync(tsc, ['-p', 'tsconfig.json', '--listFilesOnly'], {
      cwd: this.pkg(name),
      encoding: 'utf8',
    })
    return result.stdout.split(/\r?\n/).filter(Boolean)
  }

  dispose() {
    rmSync(this.root, { recursive: true, force: true })
  }
}

function require_mkdtemp(prefix: string) {
  // `fs.mkdtempSync` without importing the whole promises API.
  const dir = `${prefix}${crypto.randomBytes(4).toString('hex')}`
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * The diagnostics of a failed check that point into `file`, each with its
 * indented continuation lines (where elaborated messages appear).
 */
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
