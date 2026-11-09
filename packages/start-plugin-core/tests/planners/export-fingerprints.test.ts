/**
 * An importer's plan depends on the exports it reads, not on every export of
 * the module: editing another export (or adding one) leaves it current, and
 * editing the one it reads makes it a dependent of the edit. Every step
 * compares the importer's output with a fresh session's.
 */
import { describe, expect, it } from 'vitest'
import { invalidate } from '@tanstack/router-utils/compiler'
import { startRecognizer } from '../../src/compiler/recognizer'
import { START_ENV, startEnvPlanner } from '../../src/planners'
import { MemoryHost, clientEnv } from './memory-host'
import type { StartEnvConfig } from '../../src/planners'

const config = {
  configKey: 'cfg',
  perPlanner: {
    [START_ENV]: {
      framework: 'react',
      root: '/app',
      providerSeparate: false,
      idMode: 'dev',
    } satisfies StartEnvConfig,
  },
}
const planners = [startEnvPlanner()]
const IMPORT = `import { createServerFn } from '@tanstack/react-start'\n`
const SECRET = 'SECRET_HANDLER_BODY'
/** A client module attaching a handler to `name` imported from `from`: the handler body ships unless `name` is a server-fn builder. */
const user = (name: string, from: string) =>
  `import { ${name} } from '${from}'\nexport const fn = ${name}.handler(async () => '${SECRET}')\n`

function session(files: Record<string, string>) {
  const memory = new MemoryHost(files, { recognizer: startRecognizer() })
  const compile = async (path: string) =>
    (await memory.compile(path, planners, { env: clientEnv, config }))!.code
  /** Edits a file and returns the importers the invalidation re-plans. */
  const edit = async (path: string, text: string) => {
    memory.files[path] = text
    const res = await invalidate(
      memory.caches,
      { path, kind: 'change' },
      memory,
    )
    return res.dependents.map((k) => k.canonicalId)
  }
  /** The output a fresh session gives for `path` over the current files. */
  const fresh = async (path: string) => {
    const other = new MemoryHost(memory.files, {
      recognizer: startRecognizer(),
    })
    return (await other.compile(path, planners, { env: clientEnv, config }))!
      .code
  }
  return { memory, compile, edit, fresh }
}

describe('a dependency on a module is the exports the importer reads', () => {
  const LIB = '/app/src/lib.ts'
  const USER = '/app/src/user.ts'
  const files = {
    [LIB]: `${IMPORT}export const factory = createServerFn()\nexport const other = 1\n`,
    [USER]: user('factory', './lib'),
  }

  it('an added export or an unread export changing re-plans nothing', async () => {
    const t = session(files)
    expect(await t.compile(USER)).not.toContain(SECRET)
    expect(
      await t.edit(LIB, `${files[LIB]}export const added = 2\n`),
    ).not.toContain(USER)
    expect(await t.compile(USER)).toBe(await t.fresh(USER))
    // the unread export becomes a server-fn builder
    expect(
      await t.edit(
        LIB,
        `${IMPORT}export const factory = createServerFn()\nexport const other = createServerFn()\n`,
      ),
    ).not.toContain(USER)
    expect(await t.compile(USER)).toBe(await t.fresh(USER))
  })

  it('the read export changing kind re-plans the importer', async () => {
    const t = session(files)
    expect(await t.compile(USER)).not.toContain(SECRET)
    expect(
      await t.edit(
        LIB,
        `export const factory = (x: any) => x\nexport const other = 1\n`,
      ),
    ).toContain(USER)
    const out = await t.compile(USER)
    expect(out).toContain(SECRET)
    expect(out).toBe(await t.fresh(USER))
  })

  it('a name the module did not export appearing re-plans its importer', async () => {
    const LATER = '/app/src/later.ts'
    const t = session({ ...files, [LATER]: user('later', './lib') })
    expect(await t.compile(LATER)).toContain(SECRET)
    expect(
      await t.edit(LIB, `${files[LIB]}export const later = createServerFn()\n`),
    ).toContain(LATER)
    const out = await t.compile(LATER)
    expect(out).not.toContain(SECRET)
    expect(out).toBe(await t.fresh(LATER))
  })
})

describe('through re-exports', () => {
  const A = '/app/src/a.ts'
  const B = '/app/src/b.ts'
  const STARS = '/app/src/stars.ts'
  const NAMED = '/app/src/named.ts'
  const VIA_STARS = '/app/src/via-stars.ts'
  const VIA_NAMED = '/app/src/via-named.ts'
  const files = {
    [A]: `${IMPORT}export const factory = createServerFn()\n`,
    [B]: `export const unrelated = 1\n`,
    [STARS]: `export * from './a'\nexport * from './b'\n`,
    [NAMED]: `export { factory } from './a'\nexport const own = 1\n`,
    [VIA_STARS]: user('factory', './stars'),
    [VIA_NAMED]: user('factory', './named'),
  }

  it('another name in a star target re-plans nothing; the same name makes the lookup ambiguous', async () => {
    const t = session(files)
    expect(await t.compile(VIA_STARS)).not.toContain(SECRET)
    expect(await t.edit(B, `${files[B]}export const more = 2\n`)).not.toContain(
      VIA_STARS,
    )
    expect(await t.compile(VIA_STARS)).toBe(await t.fresh(VIA_STARS))
    expect(await t.edit(B, `${files[B]}export const factory = 1\n`)).toContain(
      VIA_STARS,
    )
    const out = await t.compile(VIA_STARS)
    expect(out).toContain(SECRET)
    expect(out).toBe(await t.fresh(VIA_STARS))
  })

  it('a star added to the barrel re-plans the importers of names it does not export itself', async () => {
    const C = '/app/src/c.ts'
    const t = session({ ...files, [C]: `export const factory = 1\n` })
    expect(await t.compile(VIA_STARS)).not.toContain(SECRET)
    expect(
      await t.edit(STARS, `${files[STARS]}export * from './c'\n`),
    ).toContain(VIA_STARS)
    const out = await t.compile(VIA_STARS)
    expect(out).toContain(SECRET)
    expect(out).toBe(await t.fresh(VIA_STARS))
  })

  it('a re-export chain depends on each hop’s read export only', async () => {
    const t = session(files)
    expect(await t.compile(VIA_NAMED)).not.toContain(SECRET)
    expect(
      await t.edit(NAMED, `${files[NAMED]}export const own2 = 2\n`),
    ).not.toContain(VIA_NAMED)
    expect(
      await t.edit(A, `${files[A]}export const extra = 2\n`),
    ).not.toContain(VIA_NAMED)
    expect(await t.compile(VIA_NAMED)).toBe(await t.fresh(VIA_NAMED))
    // the origin of the chain stops being a builder
    expect(await t.edit(A, `export const factory = 1\n`)).toContain(VIA_NAMED)
    const out = await t.compile(VIA_NAMED)
    expect(out).toContain(SECRET)
    expect(out).toBe(await t.fresh(VIA_NAMED))
  })
})

describe('a namespace read by member', () => {
  const LIB = '/app/src/lib.ts'
  const NS = '/app/src/ns.ts'
  const CALLS = '/app/src/calls.ts'
  const files = {
    [LIB]: `${IMPORT}export const factory = createServerFn()\nexport const fin = createServerFn().handler(async () => 1)\n`,
    [NS]: `import * as lib from './lib'\nexport const fn = lib.factory.handler(async () => '${SECRET}')\n`,
    [CALLS]: `import * as lib from './lib'\nexport const read = () => lib.fin()\n`,
  }

  it('depends on the members it reads: an added export re-plans nothing', async () => {
    const t = session(files)
    expect(await t.compile(NS)).not.toContain(SECRET)
    await t.compile(CALLS)
    const dependents = await t.edit(
      LIB,
      `${files[LIB]}export const added = 2\n`,
    )
    expect(dependents).not.toContain(NS)
    expect(dependents).not.toContain(CALLS)
    expect(await t.compile(NS)).toBe(await t.fresh(NS))
    expect(await t.compile(CALLS)).toBe(await t.fresh(CALLS))
  })

  it('the read member changing kind re-plans the importer', async () => {
    const t = session(files)
    expect(await t.compile(NS)).not.toContain(SECRET)
    expect(
      await t.edit(
        LIB,
        `export const factory = (x: any) => x\nexport const fin = () => 1\n`,
      ),
    ).toContain(NS)
    const out = await t.compile(NS)
    expect(out).toContain(SECRET)
    expect(out).toBe(await t.fresh(NS))
  })
})

describe('a namespace that escapes the analysis', () => {
  it('depends on the whole module: any export change re-plans it', async () => {
    const LIB = '/app/src/lib.ts'
    const NS = '/app/src/ns.ts'
    const t = session({
      [LIB]: `${IMPORT}export const factory = createServerFn()\n`,
      [NS]: `import * as lib from './lib'\nexport const all = Object.keys(lib)\n`,
    })
    const before = await t.compile(NS)
    expect(before).toBe(await t.fresh(NS))
    expect(
      await t.edit(
        LIB,
        `${IMPORT}export const factory = createServerFn()\nexport const added = 2\n`,
      ),
    ).toContain(NS)
    expect(await t.compile(NS)).toBe(await t.fresh(NS))
  })
})

describe('several names read of one module re-plan exactly their readers', () => {
  const A = '/app/src/a.ts'
  const B = '/app/src/b.ts'
  const C = '/app/src/c.ts'
  const BARREL = '/app/src/barrel.ts'
  const U1 = '/app/src/u1.ts'
  const U2 = '/app/src/u2.ts'
  const U3 = '/app/src/u3.ts'
  const NS = '/app/src/ns.ts'
  const files = {
    [A]: `${IMPORT}export const fa = createServerFn()\nexport const pa = 1\n`,
    [B]: `${IMPORT}export const fb = createServerFn()\nexport const pb = 1\n`,
    [C]: `export const pc = 1\n`,
    [BARREL]: `export * from './a'\nexport * from './b'\n`,
    // fa through the barrel
    [U1]: user('fa', './barrel'),
    // fa and fb through the barrel: two names of the barrel, one of each star target
    [U2]: `import { fa, fb } from './barrel'\nexport const f1 = fa.handler(async () => '${SECRET}')\nexport const f2 = fb.handler(async () => '${SECRET}')\n`,
    // pb through the barrel
    [U3]: user('pb', './barrel'),
    // fa as a namespace member of a
    [NS]: `import * as lib from './a'\nexport const fn = lib.fa.handler(async () => '${SECRET}')\n`,
  }
  const USERS = [U1, U2, U3, NS]

  it.each([
    [
      'an export added to a star target',
      A,
      `${files[A]}export const added = 2\n`,
      [],
    ],
    [
      'an unread export removed',
      A,
      `${IMPORT}export const fa = createServerFn()\n`,
      [],
    ],
    [
      'an unread export changing kind',
      A,
      `${IMPORT}export const fa = createServerFn()\nexport const pa = createServerFn()\n`,
      [],
    ],
    [
      'a read export changing kind',
      A,
      `export const fa = (x: any) => x\nexport const pa = 1\n`,
      [U1, U2, NS],
    ],
    ['a read export removed', B, `export const pb = 1\n`, [U2]],
    [
      'a star target gaining a name another target exports',
      B,
      `${files[B]}export const fa = 1\n`,
      [U1, U2],
    ],
    [
      'a star added to the barrel',
      BARREL,
      `${files[BARREL]}export * from './c'\n`,
      [U1, U2, U3],
    ],
    [
      'a star removed from the barrel',
      BARREL,
      `export * from './a'\n`,
      [U1, U2, U3],
    ],
    [
      'a body edit keeping every export',
      A,
      `${IMPORT}export const fa = createServerFn()\nexport const pa = 1 + 0\n`,
      [],
    ],
  ])('%s', async (_, path, text, expected) => {
    const t = session(files)
    for (const u of USERS) {
      expect(await t.compile(u)).toBe(await t.fresh(u))
    }
    expect((await t.edit(path, text)).sort()).toEqual([...expected].sort())
    for (const u of USERS) {
      expect(await t.compile(u)).toBe(await t.fresh(u))
    }
  })
})
