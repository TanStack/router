/**
 * The `import-edges` planner on an in-memory host (DESIGN §3.14.1–§3.14.3):
 * rules, scope, type-only and TypeScript-erased edges, substitution of the
 * specifier literal only, dev `onViolation` timing and memo, build edge
 * modules, mock contents, marker conflicts and invalidation (J6.13).
 */
import { describe, expect, test } from 'vitest'
import { viteEdgeModuleIds } from '../../src/import-protection/edge-modules'
import { violationsOf } from '../../src/import-protection/violations'
import { MemoryApp, ROOT } from './memory-host'
import type { ViolationInfo } from '../../src/import-protection/trace'
import type { ImportProtectionOptions } from '../../src/schema'

const SECRET = `export const secret = () => 'MARK_SECRET'\n`

function recorder(verdict?: (info: ViolationInfo) => boolean | void) {
  const calls: Array<ViolationInfo> = []
  return {
    calls,
    onViolation: (info: unknown) => {
      calls.push(info as ViolationInfo)
      return verdict?.(info as ViolationInfo)
    },
  }
}

function app(
  files: Record<string, string>,
  options: ImportProtectionOptions = {},
  mode: 'dev' | 'build' = 'dev',
) {
  return new MemoryApp({ files, options, mode })
}

/** The edge-module specifiers an output imports. */
function edgeImports(code: string): Array<string> {
  return [...code.matchAll(/(['"])(tanstack-start-ip:[^'"]+)\1/g)].map(
    (m) => m[2]!,
  )
}

describe('rules', () => {
  test('a file rule: the client import of a *.server file is substituted by its mock, located at the specifier', async () => {
    const rec = recorder()
    const a = app(
      {
        'src/secret.server.ts': SECRET,
        'src/a.ts': `import { secret } from './secret.server'\nexport const read = () => secret()\n`,
      },
      { onViolation: rec.onViolation },
    )
    const { out } = await a.compile('src/a.ts', 'client')
    expect(edgeImports(out!.code)).toHaveLength(1)
    expect(out!.code).toMatch(
      /^import \{ secret \} from 'tanstack-start-ip:client\/edge\.[\w-]+\.[\w-]+'\n/,
    )
    expect(rec.calls).toHaveLength(1)
    const info = rec.calls[0]!
    expect({
      env: info.env,
      envType: info.envType,
      type: info.type,
      pattern: info.pattern,
      specifier: info.specifier,
      importer: info.importer,
      importerLoc: info.importerLoc,
      resolved: info.resolved,
    }).toEqual({
      env: 'client',
      envType: 'client',
      type: 'file',
      pattern: '**/*.server.*',
      specifier: './secret.server',
      importer: `${ROOT}/src/a.ts`,
      importerLoc: { file: `${ROOT}/src/a.ts`, line: 1, column: 24 },
      resolved: `${ROOT}/src/secret.server.ts`,
    })
    // the server env is not denied a .server file
    const { out: server } = await a.compile('src/a.ts', 'ssr')
    expect(edgeImports(server!.code)).toEqual([])
  })

  test('a specifier rule matches the raw specifier, resolved or not; user specifiers add to the defaults', async () => {
    const rec = recorder()
    const a = app(
      {
        'src/a.ts': `import { getRequest } from '@tanstack/react-start/server'\nimport { q } from 'db-lib'\nexport const read = () => getRequest() + q()\n`,
        'node_modules/db-lib/package.json': `{"name":"db-lib"}`,
        'node_modules/db-lib/index.js': `export const q = () => 1\n`,
      },
      {
        onViolation: rec.onViolation,
        client: { specifiers: [/^db-/] },
      },
    )
    const { out } = await a.compile('src/a.ts', 'client')
    expect(edgeImports(out!.code)).toHaveLength(2)
    expect(
      rec.calls.map((c) => [c.type, c.specifier, String(c.pattern)]),
    ).toEqual([
      [
        'specifier',
        '@tanstack/react-start/server',
        '@tanstack/react-start/server',
      ],
      ['specifier', 'db-lib', '/^db-/'],
    ])
    expect(rec.calls[1]!.resolved).toBe(`${ROOT}/node_modules/db-lib/index.js`)
    expect(rec.calls[0]!.resolved).toBeUndefined()
  })

  test('a marker rule: a module importing a server-only marker is denied to the client only', async () => {
    const rec = recorder()
    const a = app(
      {
        'src/db.ts': `import '@tanstack/solid-start/server-only'\nexport const db = 1\n`,
        'src/ui.ts': `import '@tanstack/vue-start/client-only'\nexport const ui = 1\n`,
        'src/a.ts': `import { db } from './db'\nimport { ui } from './ui'\nexport const read = () => db + ui\n`,
      },
      { onViolation: rec.onViolation },
    )
    await a.compile('src/a.ts', 'client')
    await a.compile('src/a.ts', 'ssr')
    expect(rec.calls.map((c) => `${c.env} ${c.type} ${c.specifier}`)).toEqual([
      'client marker ./db',
      'ssr marker ./ui',
    ])
  })

  test('excludeFiles skips file and marker rules of node_modules targets; [] turns them on', async () => {
    const files = {
      'node_modules/lib/package.json': `{"name":"lib","main":"lib.server.js"}`,
      'node_modules/lib/lib.server.js': `import '@tanstack/react-start/server-only'\nexport const x = 1\n`,
      'src/a.ts': `import { x } from 'lib'\nexport const read = () => x\n`,
    }
    const off = recorder()
    await app(files, { onViolation: off.onViolation }).compile(
      'src/a.ts',
      'client',
    )
    expect(off.calls).toEqual([])
    const on = recorder()
    await app(files, {
      onViolation: on.onViolation,
      client: { excludeFiles: [] },
    }).compile('src/a.ts', 'client')
    expect(on.calls.map((c) => c.type)).toEqual(['file'])
  })

  test('importer scope: srcDirectory by default, include/exclude/ignoreImporters on the root-relative path', async () => {
    const files = {
      'src/secret.server.ts': SECRET,
      'src/a.ts': `import { secret } from './secret.server'\nexport const a = () => secret()\n`,
      'src/ignored.ts': `import { secret } from './secret.server'\nexport const b = () => secret()\n`,
      'lib/c.ts': `import { secret } from '../src/secret.server'\nexport const c = () => secret()\n`,
    }
    const reported = async (options: ImportProtectionOptions) => {
      const rec = recorder()
      const a = app(files, { ...options, onViolation: rec.onViolation })
      for (const f of ['src/a.ts', 'src/ignored.ts', 'lib/c.ts']) {
        const { out } = await a.compile(f, 'client')
        // an exempt importer gets the real module
        expect(edgeImports(out?.code ?? '').length > 0).toBe(
          rec.calls.some((c) => c.importer === `${ROOT}/${f}`),
        )
      }
      return rec.calls.map((c) => c.importer.slice(ROOT.length + 1))
    }
    expect(await reported({})).toEqual(['src/a.ts', 'src/ignored.ts'])
    expect(await reported({ ignoreImporters: ['**/ignored.ts'] })).toEqual([
      'src/a.ts',
    ])
    expect(await reported({ exclude: ['src/ignored.ts'] })).toEqual([
      'src/a.ts',
    ])
    expect(await reported({ include: ['lib/**'] })).toEqual(['lib/c.ts'])
  })
})

describe('which edges count', () => {
  test('type-only imports and re-exports are no edges; a mixed import counts (J6.2)', async () => {
    const rec = recorder()
    const a = app(
      {
        'src/types.server.ts': `export type T = 1\nexport const v = 1\n`,
        'src/a.ts': `import type { T } from './types.server'
import { type T as U } from './types.server'
export type { T as V } from './types.server'
export type * from './types.server'
import { type T as W, v } from './types.server'
export const x = (t: T, u: U, w: W) => v
`,
      },
      { onViolation: rec.onViolation },
    )
    const { out } = await a.compile('src/a.ts', 'client')
    expect(rec.calls.map((c) => c.importerLoc?.line)).toEqual([5])
    // `import type`/`export type` statements keep their specifier; the two
    // value-import statements of the specifier are one logical edge (the
    // type-only one TypeScript erases anyway)
    const lines = out!.code.split('\n')
    expect(
      lines.flatMap((l, i) => (edgeImports(l).length > 0 ? [i + 1] : [])),
    ).toEqual([2, 5])
  })

  test('TypeScript erases an unused or type-used import (no edge); JavaScript and verbatimModuleSyntax keep it (an evaluation edge)', async () => {
    const files = {
      'src/secret.server.ts': `globalThis.loaded = 1\nexport class Secret {}\n`,
      'src/a.ts': `import { Secret } from './secret.server'\nexport const f = (s: Secret) => s\n`,
      'src/b.js': `import { Secret } from './secret.server'\nexport const g = 1\n`,
    }
    const ts = recorder()
    const a = app(files, { onViolation: ts.onViolation })
    await a.compile('src/a.ts', 'client')
    await a.compile('src/b.js', 'client')
    expect(ts.calls.map((c) => c.importer.slice(ROOT.length + 1))).toEqual([
      'src/b.js',
    ])
    const verbatim = recorder()
    const v = new MemoryApp({
      files,
      options: { onViolation: verbatim.onViolation },
      verbatimModuleSyntax: true,
    })
    await v.compile('src/a.ts', 'client')
    expect(verbatim.calls).toHaveLength(1)
  })

  test('bare imports, re-exports, export * and dynamic import() are edges', async () => {
    const rec = recorder()
    const a = app(
      {
        'src/s.server.ts': SECRET,
        'src/a.ts': `import './s.server'
export { secret } from './s.server'
export * from './s.server'
export const load = () => import('./s.server')
`,
      },
      // (`log: 'once'` asks once per specifier and target)
      { onViolation: rec.onViolation, log: 'always' },
    )
    const { out } = await a.compile('src/a.ts', 'client')
    expect(rec.calls.map((c) => c.importerLoc?.line)).toEqual([1, 2, 3, 4])
    // each statement imports its own edge module, nothing else changed
    expect(out!.code.replace(/tanstack-start-ip:[^'"]+/g, 'X')).toBe(
      `import 'X'
export { secret } from 'X'
export * from 'X'
export const load = () => import('X')
`,
    )
  })
})

describe('dev decisions', () => {
  const files = {
    'src/secret.server.ts': SECRET,
    'src/a.ts': `import { secret } from './secret.server'\nexport const read = () => secret()\n`,
  }

  test('onViolation → false (or Promise<false>) leaves the real import and records nothing', async () => {
    const rec = recorder()
    const a = app(files, {
      onViolation: async (info) => {
        await rec.onViolation(info)
        return false
      },
    })
    const { out, outcome } = await a.compile('src/a.ts', 'client')
    expect(out!.code).toBe(files['src/a.ts'])
    expect(rec.calls).toHaveLength(1)
    expect(violationsOf(out!)).toEqual([])
    expect(outcome.error).toBeNull()
  })

  test('behavior "error": nothing is substituted and the module fails with a positioned error', async () => {
    const a = app(files, { behavior: 'error' })
    const { out, outcome } = await a.compile('src/a.ts', 'client')
    expect(edgeImports(out!.code)).toEqual([])
    expect(outcome.error?.message).toContain('src/a.ts:1:24')
    expect((outcome.error as { loc?: unknown }).loc).toEqual({
      file: `${ROOT}/src/a.ts`,
      line: 1,
      column: 23,
    })
    // a cached plan fails the module again
    const again = await a.compile('src/a.ts', 'client')
    expect(again.outcome.error).not.toBeNull()
  })

  test("log 'once' asks onViolation once per logical edge for the session; 'always' at every compile", async () => {
    for (const log of ['once', 'always'] as const) {
      const rec = recorder()
      const a = app(files, { log, onViolation: rec.onViolation })
      await a.compile('src/a.ts', 'client')
      a.write('src/a.ts', `// edited\n${files['src/a.ts']}`)
      await a.invalidate('src/a.ts')
      const { out } = await a.compile('src/a.ts', 'client')
      expect(edgeImports(out!.code)).toHaveLength(1)
      expect(rec.calls.length).toBe(log === 'once' ? 1 : 2)
    }
  })

  test('a throwing onViolation fails the compile', async () => {
    const a = app(files, {
      onViolation: () => {
        throw new Error('nope')
      },
    })
    await expect(a.compile('src/a.ts', 'client')).rejects.toThrow('nope')
  })
})

describe('build decisions', () => {
  test('every violation gets its edge module in both behaviours; onViolation is not called at compile time', async () => {
    for (const behavior of ['error', 'mock'] as const) {
      const rec = recorder()
      const a = new MemoryApp({
        files: {
          'src/secret.server.ts': SECRET,
          'src/a.ts': `import { secret } from './secret.server'\nexport const read = () => secret()\n`,
        },
        options: { behavior, onViolation: rec.onViolation },
        mode: 'build',
      })
      const { out, outcome } = await a.compile('src/a.ts', 'client')
      expect(edgeImports(out!.code)).toHaveLength(1)
      expect(rec.calls).toEqual([])
      expect(outcome.error).toBeNull()
      const [v] = violationsOf(out!)
      expect(v!.behavior).toBe(behavior)
      expect(v!.module).not.toBeNull()
      // the host serves the mock by the specifier the importer imports
      const load = a.ip.load(`\0${edgeImports(out!.code)[0]}`)
      expect(load?.code).toContain('__mk(m, "secret")')
    }
  })
})

describe('mock contents', () => {
  test('names: the target export names through export *, every name the importer reads, a default', async () => {
    const a = app({
      'src/inner.ts': `export const fromStar = 1\nexport default 'no'\n`,
      'src/secret.server.ts': `export * from './inner'\nexport const own = 1\nexport { own as 'a:b' }\nexport default 1\n`,
      'src/a.ts': `import * as ns from './secret.server'\nexport const read = () => ns.own + ns['missing'] + ns.fromStar\n`,
    })
    const { out } = await a.compile('src/a.ts', 'client')
    const [v] = violationsOf(out!)
    expect(v!.module!.content).toMatchObject({
      names: ['a:b', 'fromStar', 'missing', 'own'],
      hasDefault: true,
      effectful: false,
      file: 'src/secret.server.ts',
      importer: 'src/a.ts',
    })
  })

  test('effect classification: own effects, an effectful module it evaluates, packages without sideEffects:false', async () => {
    const files = {
      'src/pure.server.ts': `import { helper } from './helper'\nexport const p = () => helper\n`,
      'src/helper.ts': `export const helper = 1\n`,
      'src/chain.server.ts': `import './setup'\nexport const c = 1\n`,
      'src/setup.ts': `import { install } from './install'\nexport const s = 1\n`,
      'src/install.ts': `globalThis.installed = true\nexport const install = 1\n`,
      'src/pkg.server.ts': `import { a } from 'fx-lib'\nimport { b } from 'pure-lib'\nexport const k = () => a + b\n`,
      'src/purepkg.server.ts': `import { b } from 'pure-lib'\nexport const k = () => b\n`,
      'node_modules/fx-lib/package.json': `{"name":"fx-lib"}`,
      'node_modules/fx-lib/index.js': `export const a = 1\n`,
      'node_modules/pure-lib/package.json': `{"name":"pure-lib","sideEffects":false}`,
      'node_modules/pure-lib/index.js': `export const b = 1\n`,
      'src/a.js': `import { p } from './pure.server'
import { c } from './chain.server'
import { k } from './pkg.server'
import { k as k2 } from './purepkg.server'
export const all = () => [p, c, k, k2]
`,
    }
    const a = app(files)
    const { out } = await a.compile('src/a.js', 'client')
    expect(
      Object.fromEntries(
        violationsOf(out!).map((v) => [
          v.specifier,
          v.module!.content.effectful,
        ]),
      ),
    ).toEqual({
      './pure.server': false,
      './chain.server': true,
      './pkg.server': true,
      './purepkg.server': false,
    })
  })

  test('the mock module owns its exports, is pure, and carries the effect witness only for an effectful target', async () => {
    const a = app({
      'src/fx.server.ts': `globalThis.x = 1\nexport const s = 1\n`,
      'src/a.ts': `import { s } from './fx.server'\nexport const r = () => s\n`,
    })
    const { out } = await a.compile('src/a.ts', 'client')
    const code = a.ip.load(edgeImports(out!.code)[0]!)!.code
    expect(code).toContain('const e0 = /* @__PURE__ */ __mk(m, "s");')
    expect(code).toContain('export { e0 as s };')
    expect(code).toContain('export default /* @__PURE__ */ __mk(m, "default");')
    expect(code).toContain('__fx(m);')
    // no top-level member reads
    expect(code).not.toMatch(/^[^/]*\b\w+\.\w+/m)
  })
})

describe('forwarded glue and markers', () => {
  test('a module importing both markers is an error diagnostic in that module', async () => {
    const a = app({
      'src/both.ts': `import '@tanstack/react-start/server-only'\nimport '@tanstack/react-start/client-only'\nexport const v = 1\n`,
    })
    const { out } = await a.compile('src/both.ts', 'client')
    expect(out!.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['error', 'import-protection-marker-conflict'],
    ])
  })
})

describe('invalidation (J6.13)', () => {
  test('adding a marker to a target re-judges its importer; an unrelated edit of the target does not', async () => {
    const rec = recorder()
    const a = app(
      {
        'src/db.ts': `export const db = 1\n`,
        'src/a.ts': `import { db } from './db'\nexport const read = () => db\n`,
      },
      { onViolation: rec.onViolation, log: 'always' },
    )
    await a.compile('src/a.ts', 'client')
    expect(rec.calls).toEqual([])
    a.write('src/db.ts', `export const db = 2\n`)
    expect((await a.invalidate('src/db.ts')).dependents).toEqual([])
    a.write(
      'src/db.ts',
      `import '@tanstack/react-start/server-only'\nexport const db = 1\n`,
    )
    const { dependents } = await a.invalidate('src/db.ts')
    expect(dependents.map((k) => k.canonicalId)).toEqual([`${ROOT}/src/a.ts`])
    const { out } = await a.compile('src/a.ts', 'client')
    expect(edgeImports(out!.code)).toHaveLength(1)
    expect(rec.calls.map((c) => c.type)).toEqual(['marker'])
  })
})

describe('ids', () => {
  test('Vite ids round-trip through specifier, \\0 and /@id/ forms with any query', () => {
    const ref = { env: 'client', kind: 'edge', key: 'k1.h1' } as const
    const spec = viteEdgeModuleIds.specifier(ref)
    for (const id of [
      spec,
      `\0${spec}`,
      `/@id/__x00__${spec}?import`,
      `\0${spec}?server-fn-module-lookup`,
    ]) {
      expect(viteEdgeModuleIds.parse(id)).toEqual(ref)
    }
    expect(viteEdgeModuleIds.parse('/src/a.ts')).toBeNull()
  })
})
