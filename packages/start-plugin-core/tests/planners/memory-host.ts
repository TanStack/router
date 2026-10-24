/**
 * An in-memory compiler host for planner unit tests, through the public
 * `@tanstack/router-utils/compiler` API only (the core's own tests use the
 * same shape: `router-utils/tests/helpers.ts`). Files are keyed by absolute
 * path; relative specifiers resolve against the importer's directory with
 * `.ts`/`.tsx` probing.
 */
import {
  RawFactsCache,
  compileModule,
  createCompilerCaches,
} from '@tanstack/router-utils/compiler'
import type {
  CompileInput,
  CompileOutput,
  CompilerCaches,
  EnvInfo,
  HostServices,
  Planner,
} from '@tanstack/router-utils/compiler'

export function envInfo(partial: Partial<EnvInfo> = {}): EnvInfo {
  return {
    name: 'client',
    type: 'client',
    mode: 'dev',
    bundler: 'test',
    framework: 'react',
    conditions: ['browser'],
    routerSplit: true,
    ...partial,
  }
}

export const clientEnv = envInfo()
export const ssrEnv = envInfo({
  name: 'ssr',
  type: 'server',
  conditions: ['node'],
  routerSplit: false,
})

export class MemoryHost implements HostServices {
  readonly files: Record<string, string>
  readonly rawFacts: RawFactsCache
  readonly caches: CompilerCaches

  constructor(files: Record<string, string>) {
    this.files = { ...files }
    this.rawFacts = new RawFactsCache({
      readFile: (p) => this.readFile(p),
      loadVirtual: () => Promise.resolve(null),
    })
    this.caches = createCompilerCaches(this.rawFacts)
  }

  resolve(specifier: string, importer: string): Promise<{ id: string } | null> {
    if (!specifier.startsWith('.')) {
      return Promise.resolve(null)
    }
    const base = importer.split('?')[0]!
    const joined = normalize(
      `${base.slice(0, base.lastIndexOf('/'))}/${specifier}`,
    )
    for (const candidate of [joined, `${joined}.ts`, `${joined}.tsx`]) {
      if (candidate in this.files) {
        return Promise.resolve({ id: candidate })
      }
    }
    return Promise.resolve(null)
  }

  readFile(path: string): Promise<string | null> {
    return Promise.resolve(this.files[path] ?? null)
  }

  loadVirtual(): Promise<string | null> {
    return Promise.resolve(null)
  }

  compile(
    id: string,
    planners: ReadonlyArray<Planner>,
    extra: Partial<Omit<CompileInput, 'id' | 'planners'>> = {},
  ): Promise<CompileOutput | null> {
    const path = id.split('?')[0]!
    const code = extra.code ?? this.files[path]
    if (code === undefined) {
      throw new Error(`no such file: ${path}`)
    }
    return compileModule(
      {
        id,
        code,
        env: extra.env ?? clientEnv,
        planners,
        config: extra.config ?? { configKey: 'cfg', perPlanner: {} },
        wantMap: extra.wantMap ?? false,
      },
      this,
      this.caches,
    )
  }
}

function normalize(p: string): string {
  const parts: Array<string> = []
  for (const seg of p.split('/')) {
    if (seg === '.' || (seg === '' && parts.length > 0)) {
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
