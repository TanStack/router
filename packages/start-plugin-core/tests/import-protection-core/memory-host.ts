/**
 * An in-memory host for the import-protection core: files in a map, a
 * resolver with relative and `node_modules` package resolution, the
 * session's caches, and `compile(id, env)` running `compileModule` with the
 * `import-edges` planner the way a Start host does (then `afterCompile`).
 * Internal tests of the host-agnostic modules (not oracle tests).
 */
import {
  RawFactsCache,
  compileModule,
  createCompilerCaches,
  invalidate,
} from '@tanstack/router-utils/compiler'
import { createImportProtection } from '../../src/import-protection/session'
import type {
  CompileOutput,
  CompilerCaches,
  EnvInfo,
  HostServices,
  InputSourceMap,
  Planner,
} from '@tanstack/router-utils/compiler'
import type {
  CreateImportProtectionOptions,
  DevCompileOutcome,
  ImportProtection,
} from '../../src/import-protection/session'

export const ROOT = '/app'

export function envInfo(
  name: string,
  mode: 'dev' | 'build',
  partial: Partial<EnvInfo> = {},
): EnvInfo {
  const type = name === 'client' ? 'client' : 'server'
  return {
    name,
    type,
    mode,
    bundler: 'test',
    framework: 'react',
    conditions: type === 'client' ? ['browser'] : ['node'],
    routerSplit: false,
    ...partial,
  }
}

function normalize(p: string): string {
  const parts: Array<string> = []
  for (const seg of p.split('/')) {
    if (seg === '' && parts.length > 0) {
      continue
    }
    if (seg === '.') {
      continue
    }
    if (seg === '..') {
      parts.pop()
      continue
    }
    parts.push(seg)
  }
  return parts.join('/')
}

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.js']

export interface MemoryAppOptions extends Partial<
  Omit<CreateImportProtectionOptions, 'readFile'>
> {
  files: Record<string, string>
  mode?: 'dev' | 'build'
}

export class MemoryApp {
  readonly files: Record<string, string>
  readonly ip: ImportProtection
  readonly rawFacts: RawFactsCache
  readonly caches: CompilerCaches
  readonly host: HostServices

  constructor(opts: MemoryAppOptions) {
    this.files = {}
    for (const [rel, code] of Object.entries(opts.files)) {
      this.files[`${ROOT}/${rel}`] = code
    }
    const ip = createImportProtection({
      options: opts.options,
      root: opts.root ?? ROOT,
      srcDirectory: opts.srcDirectory ?? `${ROOT}/src`,
      mode: opts.mode ?? 'dev',
      ids: opts.ids,
      verbatimModuleSyntax: opts.verbatimModuleSyntax,
      // package.json lookups join native paths (backslashes on Windows)
      readFile: (file) =>
        Promise.resolve(this.files[file.replace(/\\/g, '/')] ?? null),
      isEntry: opts.isEntry,
    })
    if (!ip) {
      throw new Error('import protection is disabled')
    }
    this.ip = ip
    this.rawFacts = new RawFactsCache({
      readFile: (p) => Promise.resolve(this.files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
      markerSpecifiers: ip.markerSpecifiers,
    })
    this.caches = createCompilerCaches(this.rawFacts)
    this.host = {
      resolve: (specifier, importer) =>
        Promise.resolve(this.resolveSync(specifier, importer)),
      readFile: (p) => Promise.resolve(this.files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
      rawFacts: this.rawFacts,
    }
  }

  resolveSync(specifier: string, importer: string): { id: string } | null {
    const base = importer.split('?')[0]!
    const dir = base.slice(0, base.lastIndexOf('/'))
    let candidates: Array<string>
    if (specifier.startsWith('.')) {
      const joined = normalize(`${dir}/${specifier}`)
      candidates = EXTENSIONS.map((e) => joined + e)
    } else if (specifier.startsWith('/')) {
      candidates = EXTENSIONS.map((e) => specifier + e)
    } else {
      // packages: <root>/node_modules/<name>[/<subpath>], `main` of package.json or index.js
      const parts = specifier.split('/')
      const nameLength = specifier.startsWith('@') ? 2 : 1
      const name = parts.slice(0, nameLength).join('/')
      const sub = parts.slice(nameLength).join('/')
      const pkgDir = `${ROOT}/node_modules/${name}`
      const pkg = this.files[`${pkgDir}/package.json`]
      if (pkg === undefined) {
        return null
      }
      const main = (JSON.parse(pkg) as { main?: string }).main ?? 'index.js'
      const target = normalize(`${pkgDir}/${sub || main}`)
      candidates = EXTENSIONS.map((e) => target + e)
    }
    for (const c of candidates) {
      if (c in this.files) {
        return { id: c }
      }
    }
    return null
  }

  write(rel: string, code: string): void {
    this.files[`${ROOT}/${rel}`] = code
  }

  remove(rel: string): void {
    delete this.files[`${ROOT}/${rel}`]
  }

  /** Compiles `rel` in an env with the import-edges planner (plus `planners`), then `afterCompile` as a host does. */
  async compile(
    rel: string,
    env: string,
    extra: {
      planners?: Array<Planner>
      inputMap?: InputSourceMap | null
      code?: string
    } = {},
  ): Promise<{
    out: CompileOutput | null
    outcome: DevCompileOutcome
  }> {
    const id = rel.startsWith('/') ? rel : `${ROOT}/${rel}`
    const path = id.split('?')[0]!
    const code = extra.code ?? this.files[path]
    if (code === undefined) {
      throw new Error(`no such file: ${path}`)
    }
    const info = envInfo(env, this.ip.config.mode)
    this.ip.env(env, info.type)
    const out = await compileModule(
      {
        id,
        code,
        inputMap: extra.inputMap,
        env: info,
        planners: [...(extra.planners ?? []), this.ip.planner],
        config: { configKey: this.ip.config.configKey, perPlanner: {} },
        wantMap: false,
      },
      this.host,
      this.caches,
    )
    const outcome = out
      ? this.ip.env(env).afterCompile(id, out)
      : { error: null }
    return { out, outcome }
  }

  /** The one invalidation operation (a file edit). */
  invalidate(rel: string, kind: 'change' | 'add' | 'unlink' = 'change') {
    return invalidate(this.caches, { path: `${ROOT}/${rel}`, kind }, this.host)
  }
}
