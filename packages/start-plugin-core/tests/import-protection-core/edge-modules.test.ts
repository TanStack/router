/**
 * Edge modules evaluated in Node (J6.3, J6.8): the mock
 * owns every export (any spelling), each a safe mock; the runtime reports
 * uses by `mockAccess`; the effect witness is silent; the allowed state is
 * the real module.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, test, vi } from 'vitest'
import {
  allowedModuleCode,
  edgeModuleKey,
  mockModuleCode,
  mockRuntimeCode,
  rspackEdgeModuleIds,
} from '../../src/import-protection/edge-modules'
import { isSafeMock } from '../importProtection/mock-helpers'
import type { EdgeModuleContent } from '../../src/import-protection/edge-modules'
import type { MockAccess } from '../../src/import-protection/config'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ip-edge-modules-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))
const ids = rspackEdgeModuleIds(dir)
let counter = 0

const content = (partial: Partial<EdgeModuleContent>): EdgeModuleContent => ({
  env: 'client',
  edgeKey: 'k',
  specifier: './secret.server',
  importer: 'src/a.ts',
  file: 'src/secret.server.ts',
  names: [],
  effectful: false,
  rule: { type: 'file', index: 0 },
  resolved: null,
  hasDefault: true,
  bare: false,
  ...partial,
})

/** Writes the runtime and the mock of `c` under a fresh env and imports the mock. */
async function importMock(
  c: EdgeModuleContent,
  mockAccess: MockAccess = 'off',
): Promise<Record<string, unknown>> {
  const [m] = await importMocks([c], mockAccess, { keepEnv: false })
  return m!
}

/**
 * Writes one runtime and the mocks of `cs` under a fresh directory (the
 * runtime's state is its own) and imports them. `keepEnv`: the mocks keep
 * their contents' environment names (default: a fresh name per call).
 */
async function importMocks(
  cs: Array<EdgeModuleContent>,
  mockAccess: MockAccess,
  options: { keepEnv?: boolean; framework?: 'react' | 'solid' | 'vue' } = {},
): Promise<Array<Record<string, unknown>>> {
  const dirEnv = `e${counter++}`
  const runtime = ids.specifier({ env: dirEnv, kind: 'runtime' })
  fs.mkdirSync(path.dirname(runtime), { recursive: true })
  fs.writeFileSync(runtime, mockRuntimeCode(mockAccess, options.framework))
  const mocks: Array<Record<string, unknown>> = []
  for (const [i, c] of cs.entries()) {
    const ec = options.keepEnv ? c : { ...c, env: dirEnv }
    const edge = ids.specifier({
      env: dirEnv,
      kind: 'edge',
      key: `${i}.${edgeModuleKey(ec)}`,
    })
    fs.writeFileSync(edge, mockModuleCode(ec, runtime))
    mocks.push(
      (await import(/* @vite-ignore */ pathToFileURL(edge).href)) as Record<
        string,
        unknown
      >,
    )
  }
  return mocks
}

describe('mock', () => {
  test('owns every export, whatever its spelling, and each is a safe mock', async () => {
    const names = ['secret', '1foo', 'a:b', 'delete', 'eval', 'arguments', '']
    const m = await importMock(content({ names }))
    expect(Object.keys(m).sort()).toEqual([...names, 'default'].sort())
    for (const name of [...names, 'default']) {
      expect(isSafeMock(m[name], 'MARK_SECRET'), name).toBe(true)
    }
  })

  test("mockAccess 'error'/'warn' report the first use naming the import and the denied file; 'off' reports nothing", async () => {
    for (const mode of ['error', 'warn', 'off'] as const) {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const m = await importMock(content({ names: ['secret'] }), mode)
        const before = Object.getOwnPropertyNames(globalThis)
        ;(m.secret as () => unknown)()
        ;(m.secret as () => unknown)()
        String(m.default)
        expect(Object.getOwnPropertyNames(globalThis)).toEqual(before)
        const calls = (mode === 'warn' ? warn : error).mock.calls
        if (mode === 'off') {
          expect(error).not.toHaveBeenCalled()
          expect(warn).not.toHaveBeenCalled()
          continue
        }
        // the first use of the mocked import only (R101: a renderer probing a
        // mock made many reports; the call and the conversion were two)
        expect(calls).toHaveLength(1)
        const message = String((calls[0]![0] as Error).message)
        expect(message).toContain('"./secret.server"')
        expect(message).toContain('src/secret.server.ts')
        expect(message).toContain('src/a.ts')
        expect((mode === 'warn' ? error : warn).mock.calls).toEqual([])
      } finally {
        error.mockRestore()
        warn.mockRestore()
      }
    }
  })

  /** The messages `console.error` received while `run` ran. */
  async function reported(run: () => Promise<void>): Promise<Array<string>> {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await run()
      return error.mock.calls.map(([e]) => String((e as Error).message))
    } finally {
      error.mockRestore()
    }
  }

  test('each mocked import reports its first use once: two importers of one file, twice', async () => {
    const messages = await reported(async () => {
      const [a, b] = await importMocks(
        [
          content({ importer: 'src/a.ts', names: ['secret'] }),
          content({ importer: 'src/b.ts', names: ['secret'] }),
        ],
        'error',
      )
      ;(a!.secret as () => unknown)()
      String(a!.default)
      ;(b!.secret as () => unknown)()
      ;(b!.secret as () => unknown)()
    })
    expect(messages.map((m) => /Importer: (.*)/.exec(m)?.[1])).toEqual([
      'src/a.ts',
      'src/b.ts',
    ])
  })

  test('the environment is named by its type, and by its name where they differ', async () => {
    const messages = await reported(async () => {
      const [client, ssr] = await importMocks(
        [
          content({ env: 'client', names: ['x'] }),
          content({ env: 'ssr', names: ['x'] }),
        ],
        'error',
        { keepEnv: true },
      )
      ;(client!.x as () => unknown)()
      ;(ssr!.x as () => unknown)()
    })
    expect(messages.map((m) => m.split('\n')[0])).toEqual([
      '[import-protection] Mocked import used in the client environment',
      '[import-protection] Mocked import used in the server environment (ssr)',
    ])
  })

  test('in production the report is one line naming the denied file (or import)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const messages = await reported(async () => {
        const [file, specifier] = await importMocks(
          [content({ names: ['x'] }), content({ file: null, names: ['x'] })],
          'error',
        )
        ;(file!.x as () => unknown)()
        ;(specifier!.x as () => unknown)()
      })
      expect(messages.map((m) => m.split(': ').slice(1).join(': '))).toEqual([
        'src/secret.server.ts',
        './secret.server',
      ])
      expect(messages.every((m) => !m.includes('\n'))).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  test('a module that is its own violation names no import; an unknown edge module names its import', async () => {
    const [own, unknown] = await reported(async () => {
      const [a, b] = await importMocks(
        [
          // a pattern import brought the denied file (no importer)
          content({
            importer: '',
            specifier: 'src/secret.server.ts',
            names: ['x'],
          }),
          // an importer restored from a persistent cache (`unknownEdgeLoad`)
          content({ importer: '', file: null, specifier: 'k1', names: ['x'] }),
        ],
        'error',
      )
      ;(a!.x as () => unknown)()
      ;(b!.x as () => unknown)()
    })
    expect(own).toContain('Importer: a pattern import')
    expect(own).not.toContain('Denied import:')
    expect(unknown).toContain('Denied import: "k1"')
    expect(unknown).not.toContain('a pattern import')
  })

  test("a Vue app's server report names the denied import in its component fix, as written", async () => {
    const specifier = "./a$&'b.client.vue"
    const [message] = await reported(async () => {
      const [m] = await importMocks(
        [content({ env: 'ssr', specifier, names: ['x'] })],
        'error',
        { keepEnv: true, framework: 'vue' },
      )
      ;(m!.x as () => unknown)()
    })
    expect(message).toContain(`import('./a$&\\'b.client.vue')`)
    expect(message).not.toContain('__SPECIFIER__')
  })

  test('the effect witness of an effectful target defines no global and logs nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const before = Object.getOwnPropertyNames(globalThis)
      await importMock(content({ names: ['x'], effectful: true }), 'error')
      expect(Object.getOwnPropertyNames(globalThis)).toEqual(before)
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })

  test('only the effectful mock carries the witness; a new content is a new key', () => {
    const pure = content({ names: ['x'] })
    const fx = content({ names: ['x'], effectful: true })
    expect(mockModuleCode(pure, 'rt')).not.toContain('__fx(m)')
    expect(mockModuleCode(fx, 'rt')).toContain('__fx(m)')
    expect(edgeModuleKey(pure)).not.toBe(edgeModuleKey(fx))
  })
})

describe('allowed', () => {
  test('re-exports the real module (default only when it has one); a bare edge imports it', async () => {
    const real = path.join(dir, `real${counter++}.mjs`)
    fs.writeFileSync(
      real,
      `export const secret = 'MARK_SECRET'\nexport let count = 0\nexport const inc = () => { count++ }\nexport default 'DEFAULT'\n`,
    )
    const allowed = path.join(dir, `allowed${counter++}.mjs`)
    fs.writeFileSync(allowed, allowedModuleCode(content({}), real))
    const m = (await import(
      /* @vite-ignore */ pathToFileURL(allowed).href
    )) as {
      secret: string
      default: string
      count: number
      inc: () => void
    }
    expect([m.secret, m.default]).toEqual(['MARK_SECRET', 'DEFAULT'])
    // a live binding stays live
    m.inc()
    expect(m.count).toBe(1)
    expect(allowedModuleCode(content({ hasDefault: false }), real)).not.toMatch(
      /default/,
    )
    expect(allowedModuleCode(content({ bare: true }), real)).toBe(
      `import ${JSON.stringify(real)};\n`,
    )
  })
})

describe('Rspack ids', () => {
  test('resources round-trip; foreign files are not ours', () => {
    const ref = { env: 'ssr', kind: 'edge', key: 'abc.def' } as const
    const file = ids.specifier(ref)
    // ids are forward-slash paths (Windows too)
    expect(file.startsWith(`${dir.replace(/\\/g, '/')}/`)).toBe(true)
    expect(ids.parse(file)).toEqual(ref)
    expect(ids.parse(`${file}?query`)).toEqual(ref)
    expect(ids.parse(ids.specifier({ env: 'ssr', kind: 'runtime' }))).toEqual({
      env: 'ssr',
      kind: 'runtime',
    })
    expect(ids.parse(path.join(dir, '../other.mjs'))).toBeNull()
  })

  // An importer restored from the persistent cache in a new process
  // requests an edge module nothing registered: its request defines it.
  test('a request names its file and carries its content, checked against its key', () => {
    const c = content({ names: ['secret', 'a:b'], resolved: '/x/secret.ts' })
    const key = edgeModuleKey(c)
    const request = ids.request(key, c)
    expect(request).toBe(ids.request(key, { ...c }))
    expect(ids.parse(request)).toEqual({ env: 'client', kind: 'edge', key })
    expect(request.startsWith(`${ids.specifier(ids.parse(request)!)}?`)).toBe(
      true,
    )
    expect(ids.content!(request)).toEqual(c)
    // another key, environment or a content that is not the key's: not ours
    const other = content({ names: ['other'] })
    const forged = request.replace(
      /\?.*$/,
      ids.request(key, other).slice(request.indexOf('?')),
    )
    expect(ids.content!(forged)).toBeNull()
    expect(
      ids.content!(ids.specifier({ env: 'client', kind: 'edge', key })),
    ).toBeNull()
    expect(
      ids.content!(
        `${ids.specifier({ env: 'client', kind: 'edge', key })}?tss-ip=%%%`,
      ),
    ).toBeNull()
  })
})
