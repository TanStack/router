/**
 * Overlapping requests of one module on Start's Vite dev server, each held
 * where a user's own input can hold it (a plugin's `resolveId`, an async
 * `allowImport`): the caller always gets its own answer (code, mock or error)
 * and can load what that answer names, and what the server shares (the server
 * fn registry, import protection's reports and edges) is the newest answer's.
 * An answer that a newer request, an event or a removal overtook while it
 * waited reports nothing and replaces nothing.
 *
 * Settlement design, step 0 (design-settlement.md §6, rows (b) and (c));
 * step 2 (`session.transform`: `judge`, `defineEdges`, one commit for a
 * current answer) fixed the overlaps the older answer published in
 * (KNOWN-BUGS, fixed: "An overtaken compile still published").
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { expectNoDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { callServerFn, startDevServer, startRequestFiles } from '../dev-server'
import {
  runViteClient,
  startBrowserStartDevServer,
} from './importProtection/client-pages'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { Plugin } from 'vite'
import type {
  ImportProtectionOptions,
  ViolationInfo,
} from '../importProtection/public-types'

/** A gate: `reached` once something waits on it, until `release`. */
function holdPoint() {
  let release!: () => void
  const released = new Promise<void>((r) => (release = r))
  let armed: (() => void) | null = null
  return {
    /** Arms the gate for the next wait; resolves when something waits. */
    arm: () =>
      new Promise<void>((reached) => {
        armed = reached
      }),
    /** Waits at the gate when armed, else goes on. */
    async wait() {
      const reached = armed
      if (reached) {
        armed = null
        reached()
        await released
      }
    },
    release,
  }
}

/** A plugin holding the next resolution of `specifier` in `environment` at `gate`. */
function holdResolution(
  gate: ReturnType<typeof holdPoint>,
  specifier: string,
  environment: string,
): Plugin {
  return {
    name: 'test:hold-resolution',
    enforce: 'pre',
    async resolveId(source) {
      if (this.environment.name === environment && source === specifier) {
        await gate.wait()
      }
      return null
    },
  }
}

/** Import protection telling the test of every report (`reports`), and `allowImport` held at `gate`. */
function protection(
  gate: ReturnType<typeof holdPoint> | null,
  answer: (info: { importer: string }) => boolean = () => false,
) {
  const reports: Array<string> = []
  const asked: Array<string> = []
  const name = (file: string) => path.basename(file.split('?')[0]!)
  const importProtection: ImportProtectionOptions = {
    behavior: 'mock',
    onViolation: (info: ViolationInfo) => {
      reports.push(`${name(info.importer)} -> ${info.specifier}`)
    },
    ...(gate && {
      allowImport: async (info) => {
        asked.push(`${name(info.importer)} -> ${info.specifier}`)
        await gate.wait()
        return answer(info)
      },
    }),
  }
  return { importProtection, reports, asked }
}

const marked = `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`
const unmarked = `export const secret = () => 'MARK_SECRET'\n`
/** `form.ts` reading the marked `lib.ts` (a violation in the client while `lib.ts` is marked). */
const readsLib = `import { secret } from './lib'
export const read = () => secret()
`
const plainForm = `export const read = () => 'MARK_PLAIN'\n`
/** What a call of the denied file's `secret` gives: its value, or `mock`. */
const valueOf = `const valueOf = (secret: () => unknown) => {
  const value: unknown = secret()
  return typeof value === 'string' && value.startsWith('MARK_') ? value : 'mock'
}`

describe('Vite dev: an older compile of a module answered after a newer one', () => {
  // `form.ts` is saved to import the denied `data.server.ts`, and that
  // compile waits on the resolution; it is saved again without the import,
  // and the newer text is compiled and served. The older compile answers
  // last: its own caller gets its answer, and nothing reports the import
  // the file no longer has.
  // Source: whole-PR review C6-02 (b) (V-28, Astra's Vite dev probe
  // `v28/overlap.mjs`).
  test('C6-02b: an import the newer text removed is not reported', async () => {
    const gate = holdPoint()
    const { importProtection, reports } = protection(null)
    const server = await startDevServer({
      plugins: [holdResolution(gate, './data.server', 'client')],
      start: { importProtection },
      files: {
        'src/data.server.ts': `export const value = 1\n`,
        'src/shared.ts': `export const value = 2\n`,
        'src/form.ts': `import { value } from './shared'\nexport const current = value\n`,
      },
    })
    await server.transform('/src/form.ts')
    await server.edit({
      'src/form.ts': `import { value } from './data.server'\nexport const current = value\n`,
    })
    const reached = gate.arm()
    const older = server.transform('/src/form.ts')
    await reached
    await server.edit({
      'src/form.ts': `import { value } from './shared'\nexport const latest = value\n`,
    })
    expect(await server.transform('/src/form.ts')).toContain('latest')
    gate.release()
    expect(await older).toContain('current')
    await server.idle()
    expect(reports).toEqual([])
  })

  /**
   * `form.ts` imports the marked `lib.ts`; the compile's `allowImport` call
   * waits. Then `between` runs (edits that end with `form.ts` reading
   * `lib.ts` again, as its text says, after `lib.ts` dropped its marker),
   * the newest request (of `newest`, a URL of the file) is served, and the
   * held `allowImport` answers (`false`, the mock) last. Gives what
   * `onViolation` was told. Each request gets its own answer: the older one
   * the mock, the newest the real `lib.ts` (a setup that gives them one
   * answer throws: it shows nothing).
   */
  async function heldJudgement(
    between: (server: DevServer) => Promise<void>,
    newest: (server: DevServer) => string = () => '/src/form.ts',
  ): Promise<Array<string>> {
    const gate = holdPoint()
    const { importProtection, reports } = protection(gate)
    const server = await startDevServer({
      start: { importProtection },
      files: { 'src/lib.ts': marked, 'src/form.ts': plainForm },
    })
    await server.transform('/src/form.ts')
    await server.edit({ 'src/form.ts': readsLib })
    const reached = gate.arm()
    const older = server.transform('/src/form.ts')
    await reached
    await between(server)
    // (the newest request: `lib.ts` is plain now, so no violation)
    const newer = await server.transform(newest(server))
    if (reports.length > 0) {
      throw new Error(`test: reported before the release: ${reports}`)
    }
    gate.release()
    if ((await older) === newer) {
      throw new Error('test: the two requests got one answer')
    }
    await server.idle()
    return reports
  }

  // Overlaps whose older answer is of the text the file has again, judged
  // against `lib.ts` as it was: a text comparison takes it for the newest.
  // Source: Astra's review of the settlement design, change 2.
  test('the file saved with other text and back (A, B, A): the older A reports nothing', async () => {
    expect(
      await heldJudgement(async (server) => {
        await server.edit({ 'src/form.ts': plainForm })
        await server.transform('/src/form.ts')
        await server.edit({ 'src/lib.ts': unmarked })
        await server.edit({ 'src/form.ts': readsLib })
      }),
    ).toEqual([])
  })

  // Vite keys a request in flight by its URL, and the module of a file
  // created again joins the older request of the same URL: the newest
  // request names the file by Vite's `/@fs/` URL.
  // Source: Astra's review of settlement step 0, finding 1 (`unlink.mjs`).
  test('the file removed and created again with the same bytes: the older compile reports nothing', async () => {
    expect(
      await heldJudgement(
        async (server) => {
          await server.edit({ 'src/form.ts': null })
          await server.edit({ 'src/lib.ts': unmarked })
          await server.edit({ 'src/form.ts': readsLib })
        },
        (server) => `/@fs${server.file('src/form.ts')}`,
      ),
    ).toEqual([])
  })

  test('a dependency-only rebuild of the same text: the older compile reports nothing', async () => {
    expect(
      await heldJudgement(async (server) => {
        await server.edit({ 'src/lib.ts': unmarked })
      }),
    ).toEqual([])
  })
})

describe('Vite dev: what an overtaken answer names loads', () => {
  // `form.ts` is saved to import the denied `secret.client.ts` (client-only:
  // denied on the server) and a helper whose resolution waits; it is saved
  // again without them before that compile answers. The SSR import that
  // asked for the older text gets its answer: its edge module loads, and
  // the denied import is its mock.
  // Source: Gemini's review of the settlement design, change 1.
  test("an overtaken answer with a new denied import: its caller's edge module loads as the mock", async () => {
    const gate = holdPoint()
    const { importProtection } = protection(null)
    const server = await startDevServer({
      plugins: [holdResolution(gate, './secret.client', 'ssr')],
      start: { importProtection },
      files: {
        'src/secret.client.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/slow.ts': `export const slow = 1\n`,
        'src/form.ts': plainForm,
      },
    })
    await server.transform('/src/form.ts', 'ssr')
    await server.edit({
      'src/form.ts': `import { secret } from './secret.client'
import { slow } from './slow'
${valueOf}
export const read = () => [valueOf(secret), slow]
`,
    })
    const reached = gate.arm()
    const older = server.import('/src/form.ts')
    await reached
    await server.edit({ 'src/form.ts': plainForm })
    // (the newer text is served first)
    expect(await server.transform('/src/form.ts', 'ssr')).toContain(
      'MARK_PLAIN',
    )
    gate.release()
    expect((await older).read()).toEqual(['mock', 1])
    expect(await server.transform('/src/form.ts', 'ssr')).toContain(
      'MARK_PLAIN',
    )
  })

  // `allowImport` allows `form.ts`'s import of `secret.client.ts`; it is
  // asked while the file is saved again with other text. The SSR import that
  // asked for the older text loads the real export through the edge `allowImport`
  // allowed, the callback runs once for the import, and the newer text
  // stands.
  // Source: Astra's re-check of the settlement design (rev 2), change 3.
  test('an overtaken importer whose import allowImport allowed loads the real export, with one callback', async () => {
    const gate = holdPoint()
    const { importProtection, asked, reports } = protection(gate, () => true)
    const server = await startDevServer({
      start: { importProtection },
      files: {
        'src/secret.client.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/form.ts': plainForm,
      },
    })
    await server.transform('/src/form.ts', 'ssr')
    await server.edit({
      'src/form.ts': `import { secret } from './secret.client'
${valueOf}
export const read = () => valueOf(secret)
`,
    })
    const reached = gate.arm()
    const older = server.import('/src/form.ts')
    await reached
    await server.edit({ 'src/form.ts': plainForm })
    // (the module runner joins its own import in flight: the newer text
    // is requested of the environment)
    expect(await server.transform('/src/form.ts', 'ssr')).toContain(
      'MARK_PLAIN',
    )
    gate.release()
    expect((await older).read()).toBe('MARK_SECRET')
    await server.idle()
    // (the denied file is asked about too, as its own importer, when it
    // is compiled under its own id)
    expect(asked.filter((a) => a.startsWith('form.ts'))).toEqual([
      'form.ts -> ./secret.client',
    ])
    expect(reports).toEqual([])
    // (not imported: the module runner keeps the module it evaluated for
    // the older request)
    expect(await server.transform('/src/form.ts', 'ssr')).toContain(
      'MARK_PLAIN',
    )
  })

  // One import judged twice: the overtaken compile's `allowImport` call is
  // still waiting when a newer text with the same import is compiled.
  test('allowImport is asked once per import across an overtaken compile', async () => {
    const gate = holdPoint()
    const { importProtection, asked } = protection(gate)
    const server = await startDevServer({
      start: { importProtection },
      files: { 'src/lib.ts': marked, 'src/form.ts': plainForm },
    })
    await server.transform('/src/form.ts')
    await server.edit({ 'src/form.ts': readsLib })
    const reached = gate.arm()
    const older = server.transform('/src/form.ts')
    await reached
    await server.edit({ 'src/form.ts': `// edited\n${readsLib}` })
    const newer = server.transform('/src/form.ts')
    gate.release()
    await Promise.all([older, newer])
    expect(asked).toEqual(['form.ts -> ./lib'])
  })
})

describe('Vite dev: what an overtaken answer decides later', () => {
  // `form.ts` is saved with a type-only import of the client-only
  // `one.client.ts` that `verbatimModuleSyntax` keeps (import protection
  // decides it when the bundler requests the edge) and an import whose
  // resolution waits; it is saved again without them before that compile
  // answers. Under `behavior: 'error'` the SSR import that asked for the
  // older text still fails, though nothing records the removed import.
  // Source: Astra's review of settlement step 2, issue 1
  // (`step2-deferred-review.mjs`, mode `pending`).
  test("an overtaken answer's import decided at the request: its caller fails under behavior 'error'", async () => {
    const gate = holdPoint()
    const reports: Array<string> = []
    const server = await startDevServer({
      plugins: [holdResolution(gate, './slow', 'ssr')],
      start: {
        importProtection: {
          behavior: 'error',
          onViolation: (info: ViolationInfo) => {
            reports.push(path.basename(info.importer.split('?')[0]!))
          },
        },
      },
      files: {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { verbatimModuleSyntax: true },
        }),
        'src/one.client.ts': `export type T = string\nexport const one = () => 'MARK_ONE'\n`,
        'src/slow.ts': `export const slow = 1\n`,
        'src/form.ts': plainForm,
      },
    })
    await server.transform('/src/form.ts', 'ssr')
    await server.edit({
      'src/form.ts': `import { type T } from './one.client'
import { slow } from './slow'
export const read = (): T | number => slow
`,
    })
    const reached = gate.arm()
    const older = server.import('/src/form.ts')
    await reached
    await server.edit({ 'src/form.ts': plainForm })
    expect(await server.transform('/src/form.ts', 'ssr')).toContain(
      'MARK_PLAIN',
    )
    gate.release()
    await expect(older).rejects.toThrow()
    await server.idle()
    expect(reports).toEqual([])
  })

  // The same answer, the other order: the older compile answers (overtaken)
  // and its request waits after Start's transform, before the bundler
  // resolves the edge its code names; the newer text commits meanwhile.
  // Then the edge is requested: the older caller still fails.
  // Source: Astra's re-check of settlement step 3 (23e9107e4d).
  test("an overtaken answer's import decided at the request, requested after a newer commit: its caller fails", async () => {
    const older = holdPoint()
    const newer = holdPoint()
    const analysis = holdPoint()
    const isForm = (id: string | undefined) =>
      id !== undefined && id.split('?')[0]!.endsWith('/src/form.ts')
    const server = await startDevServer({
      plugins: [
        holdResolution(older, './slow', 'ssr'),
        holdResolution(newer, './slow2', 'ssr'),
        {
          // (after Start's transform: the bundler's import analysis of
          // the module's code waits here)
          name: 'test:hold-after-transform',
          enforce: 'post',
          async transform(_code, id) {
            if (this.environment.name === 'ssr' && isForm(id)) {
              await analysis.wait()
            }
            return null
          },
        },
      ],
      start: { importProtection: { behavior: 'error' } },
      files: {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { verbatimModuleSyntax: true },
        }),
        'src/one.client.ts': `export type T = string\nexport const one = () => 'MARK_ONE'\n`,
        'src/slow.ts': `export const slow = 1\n`,
        'src/slow2.ts': `export const slow2 = 2\n`,
        'src/form.ts': plainForm,
      },
    })
    await server.transform('/src/form.ts', 'ssr')
    await server.edit({
      'src/form.ts': `import { type T } from './one.client'
import { slow } from './slow'
export const read = (): T | number => slow
`,
    })
    const olderReached = older.arm()
    const olderAnswer = server.transform('/src/form.ts', 'ssr')
    await olderReached
    await server.edit({
      'src/form.ts': `import { slow2 } from './slow2'\nexport const read = () => slow2\n`,
    })
    const newerReached = newer.arm()
    const newerAnswer = server.transform('/src/form.ts', 'ssr')
    await newerReached
    // the older answer is overtaken; its code waits before import analysis
    const analysisReached = analysis.arm()
    older.release()
    await analysisReached
    // the newer text commits (no import of `one.client.ts`)
    newer.release()
    expect(await newerAnswer).toContain('slow2')
    analysis.release()
    await expect(olderAnswer).rejects.toThrow()
  })

  // Two older texts of `form.ts` with that import, both overtaken by a third
  // without it: each older caller fails when it requests the edge, before
  // the newest text commits or after.
  // Source: Fable's and Astra's quick looks at settlement step 3
  // (b27e93a38f: the first request consumed the edge's entry for both).
  test.each(['before', 'after'] as const)(
    'two overtaken answers naming one edge decided at the request: both callers fail, requested %s the newer commit',
    async (when) => {
      const first = holdPoint()
      const second = holdPoint()
      const newest = holdPoint()
      const firstAnalysis = holdPoint()
      const secondAnalysis = holdPoint()
      const isForm = (id: string | undefined) =>
        id !== undefined && id.split('?')[0]!.endsWith('/src/form.ts')
      const analyses = [firstAnalysis, secondAnalysis]
      let transformed = 0
      const server = await startDevServer({
        plugins: [
          holdResolution(first, './slow', 'ssr'),
          holdResolution(second, './slow', 'ssr'),
          holdResolution(newest, './slow2', 'ssr'),
          {
            // (after Start's transform, before the bundler's import
            // analysis of the module's code)
            name: 'test:hold-after-transform',
            enforce: 'post',
            async transform(_code, id) {
              if (this.environment.name === 'ssr' && isForm(id)) {
                await analyses[transformed++]?.wait()
              }
              return null
            },
          },
        ],
        start: { importProtection: { behavior: 'error' } },
        files: {
          'tsconfig.json': JSON.stringify({
            compilerOptions: { verbatimModuleSyntax: true },
          }),
          'src/one.client.ts': `export type T = string\nexport const one = () => 'MARK_ONE'\n`,
          'src/slow.ts': `export const slow = 1\n`,
          'src/slow2.ts': `export const slow2 = 2\n`,
          'src/form.ts': plainForm,
        },
      })
      await server.transform('/src/form.ts', 'ssr')
      // (no transform of `form.ts` before the held ones counts)
      transformed = 0
      /** Saves an older text and requests it; its compile is held at `gate`. */
      const older = async (gate: ReturnType<typeof holdPoint>, n: number) => {
        await server.edit({
          'src/form.ts': `import { type T } from './one.client'
import { slow } from './slow'
export const read = (): T | number => slow + ${n}
`,
        })
        const reached = gate.arm()
        const answer = server.transform('/src/form.ts', 'ssr').then(
          () => 'served',
          () => 'failed',
        )
        await reached
        return { answer }
      }
      const one = await older(first, 1)
      const two = await older(second, 2)
      await server.edit({
        'src/form.ts': `import { slow2 } from './slow2'\nexport const read = () => slow2\n`,
      })
      const newestReached = newest.arm()
      const newestAnswer = server.transform('/src/form.ts', 'ssr')
      // both older answers are overtaken once the newest text is requested
      await newestReached
      if (when === 'before') {
        // their requests run on: the edge is requested before the commit
        first.release()
        second.release()
        expect([await one.answer, await two.answer]).toEqual([
          'failed',
          'failed',
        ])
        newest.release()
        expect(await newestAnswer).toContain('slow2')
        return
      }
      // their requests wait before import analysis while the newest commits
      const analysed = [firstAnalysis.arm(), secondAnalysis.arm()]
      first.release()
      second.release()
      await Promise.all(analysed)
      newest.release()
      expect(await newestAnswer).toContain('slow2')
      firstAnalysis.release()
      secondAnalysis.release()
      expect([await one.answer, await two.answer]).toEqual(['failed', 'failed'])
    },
  )

  // `allowImport` allows `form.ts`'s import of the client-only
  // `one.client.ts` and nothing else (not the file as its own importer);
  // it answers while the file is saved again without the import. The SSR
  // import that asked for the older text loads the edge `allowImport`
  // allowed, which re-exports the file: the file's own compile finds no
  // allowed importer recorded (the answer that asked was overtaken) and
  // serves its mock.
  // Source: Astra's review of settlement step 2, issue 2
  // (`step2-import-review.mjs`, mode `allowed`).
  test.fails(
    'an overtaken importer whose import allowImport allowed loads the real export, without the file allowed as its own importer',
    async () => {
      const gate = holdPoint()
      const server = await startDevServer({
        start: {
          importProtection: {
            behavior: 'mock',
            allowImport: async (info) => {
              if (info.importer.split('?')[0]!.endsWith('/form.ts')) {
                await gate.wait()
                return true
              }
              return false
            },
          },
        },
        files: {
          'src/secret.client.ts': `export const secret = () => 'MARK_SECRET'\n`,
          'src/form.ts': plainForm,
        },
      })
      await server.transform('/src/form.ts', 'ssr')
      await server.edit({
        'src/form.ts': `import { secret } from './secret.client'
${valueOf}
export const read = () => valueOf(secret)
`,
      })
      const reached = gate.arm()
      const older = server.import('/src/form.ts')
      await reached
      await server.edit({ 'src/form.ts': plainForm })
      expect(await server.transform('/src/form.ts', 'ssr')).toContain(
        'MARK_PLAIN',
      )
      gate.release()
      expect((await older).read()).toBe('MARK_SECRET')
    },
  )

  // `form.ts` imports two client-only files; its compile is current and
  // reports, and `onViolation` waits on the first import. The file is saved
  // again without either import, and the newer text is served: the second
  // import is not reported.
  // Source: Astra's review of settlement step 2, issue 3
  // (`step2-deferred-review.mjs`, mode `reports`).
  test('a report held in onViolation: the answer it is of was overtaken, the next import is not reported', async () => {
    const gate = holdPoint()
    const reports: Array<string> = []
    const server = await startDevServer({
      start: {
        importProtection: {
          behavior: 'mock',
          onViolation: async (info: ViolationInfo) => {
            reports.push(info.specifier)
            await gate.wait()
          },
        },
      },
      files: {
        'src/one.client.ts': `export const one = () => 'MARK_ONE'\n`,
        'src/two.client.ts': `export const two = () => 'MARK_TWO'\n`,
        'src/form.ts': plainForm,
      },
    })
    await server.transform('/src/form.ts', 'ssr')
    await server.edit({
      'src/form.ts': `import { one } from './one.client'
import { two } from './two.client'
export const read = () => [one(), two()]
`,
    })
    const reached = gate.arm()
    const older = server.transform('/src/form.ts', 'ssr')
    await reached
    await server.edit({ 'src/form.ts': plainForm })
    expect(await server.transform('/src/form.ts', 'ssr')).toContain(
      'MARK_PLAIN',
    )
    gate.release()
    await older
    await server.idle()
    expect(reports).toHaveLength(1)
  })
})

describe('Vite dev: the late pass and the asset load overtaken', () => {
  // A plugin makes the JavaScript of a package's `.mdx` (no file of the
  // package changes): first code that names a Start factory, whose compile
  // waits on a resolution, then plain code, which the late pass does not
  // admit. The plain answer overtakes the held one: when it answers, it
  // warns about nothing (the package does not declare Start).
  // Source: Astra's review of settlement step 3, issue 2
  // (`step3-overlap.mjs`).
  test("a late module's newer code the late pass does not admit: the older answer warns about nothing", async () => {
    const gate = holdPoint()
    const plainLabel = `export const label = 'MARK_CURRENT_LABEL'\n`
    let generated = plainLabel
    const isLabel = (id: string | undefined) =>
      id !== undefined && id.split('?')[0]!.endsWith('/label.mdx')
    const server = await startDevServer({
      plugins: [
        {
          name: 'test:generate-label-module',
          enforce: 'pre',
          async resolveId(source, importer) {
            if (source === './factory.js' && isLabel(importer)) {
              await gate.wait()
            }
            return null
          },
          transform(_code, id) {
            return isLabel(id) ? { code: generated, map: null } : null
          },
        },
      ],
      files: {
        'node_modules/label-kit/package.json': JSON.stringify({
          name: 'label-kit',
          version: '1.0.0',
          type: 'module',
        }),
        'node_modules/label-kit/factory.js': `export { createServerFn } from '@tanstack/react-start'\n`,
        'node_modules/label-kit/label.mdx': `# label\n`,
      },
    })
    const url = '/node_modules/label-kit/label.mdx'
    const graph = server.vite.environments.client.moduleGraph
    const invalidate = async () => {
      graph.invalidateModule((await graph.getModuleByUrl(url))!)
    }
    await server.transform(url)
    generated = `import { createServerFn } from './factory.js'
export const readLabel = createServerFn().handler(() => 'MARK_PREVIOUS')
`
    await invalidate()
    const reached = gate.arm()
    const older = server.transform(url)
    await reached
    generated = plainLabel
    await invalidate()
    expect(await server.transform(url)).toContain('MARK_CURRENT_LABEL')
    gate.release()
    await older
    await server.idle()
    expectNoDiagnostic(server.diagnostics, {
      severity: 'warning',
      file: 'node_modules/label-kit/label.mdx',
      root: server.root,
    })
  })

  // `secret.ts` is loaded as its text (`?raw`) while it is marked, and
  // `allowImport` waits; the marker is removed and the text loaded again
  // (no violation). The older load answers last: `onViolation` hears
  // nothing of the removed marker.
  // Source: Astra's and Gemini's reviews of settlement step 3 (Astra
  // `step3-overlap.mjs`, mode `asset`; Gemini check 2).
  test("an asset load overtaken by its file's edit: the older load reports nothing", async () => {
    const gate = holdPoint()
    const reports: Array<string> = []
    const server = await startDevServer({
      start: {
        importProtection: {
          behavior: 'mock',
          allowImport: async () => {
            await gate.wait()
            return false
          },
          onViolation: (info: ViolationInfo) => {
            reports.push(info.specifier)
          },
        },
      },
      files: { 'src/secret.ts': unmarked },
    })
    await server.transform('/src/secret.ts?raw')
    await server.edit({ 'src/secret.ts': marked })
    const reached = gate.arm()
    const older = server.transform('/src/secret.ts?raw')
    await reached
    await server.edit({ 'src/secret.ts': unmarked })
    expect(await server.transform('/src/secret.ts?raw')).not.toContain(
      'server-only',
    )
    gate.release()
    await older
    await server.idle()
    expect(reports).toEqual([])
  })
})

describe('Vite dev: outputs of one text', () => {
  // A server fn file with a denied import its module reads outside the
  // handler: the SSR module's output imports it (a violation, reported), the
  // handler module's does not. The client compiled the file (the page reads
  // the fn's URL); SSR has not. The SSR module is requested and its compile
  // waits on a resolution inside its transform; the call (as a page's) then
  // requests the handler module, which reaches the transform before the wait
  // ends. Both stand: the call answers the handler, and the SSR module's
  // request reports its violation, which only that output has. No hot update
  // runs, so no later request of the SSR module (one transform of it) can
  // stand in for the held one.
  // Source: Astra's and Gemini's reviews of settlement step 0 (rounds 2 to
  // 4); Gemini's round-4 drive.
  test('two outputs of one text in one environment both stand: the handler answers, the module reports', async () => {
    let moduleTransforms = 0
    let held: { reached: () => void; release: Promise<void> } | null = null
    let handlerArrived: (() => void) | null = null
    const isFns = (id: string | undefined) =>
      id !== undefined && id.split('?')[0]!.endsWith('/src/fns.ts')
    const plugin: Plugin = {
      name: 'test:hold-in-transform',
      enforce: 'pre',
      transform: {
        order: 'pre',
        handler(_code, id) {
          if (this.environment.name === 'ssr' && isFns(id)) {
            if (id.includes('?')) {
              handlerArrived?.()
            } else {
              moduleTransforms++
            }
          }
          return null
        },
      },
      async resolveId(source, importer) {
        if (
          this.environment.name === 'ssr' &&
          source === './helper' &&
          isFns(importer) &&
          !importer!.includes('?') &&
          moduleTransforms > 0 &&
          held
        ) {
          const hold = held
          held = null
          hold.reached()
          await hold.release
        }
        return null
      },
    }
    const { importProtection, reports } = protection(null)
    const server = await startBrowserStartDevServer({
      plugins: [plugin],
      start: { importProtection },
      files: {
        ...startRequestFiles,
        'src/helper.ts': `export const helper = (marker: string) => marker\n`,
        'src/secret.client.ts': `export const secret = 'MARK_SECRET'\n`,
        'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { helper } from './helper'
import { secret } from './secret.client'
export const top = secret
export const fn = createServerFn().handler(() => helper('MARK_NEW'))
`,
      },
    })
    const { result: url } = await runViteClient(
      server,
      '/src/fns.ts',
      'return entry.fn.url',
    )
    if (moduleTransforms !== 0) {
      throw new Error('test: the SSR module was compiled before the row')
    }
    const timedOut = (what: string) =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`test: ${what}`)), 10_000),
      )
    let release!: () => void
    const reached = new Promise<void>((r) => {
      held = {
        reached: r,
        release: new Promise<void>((done) => (release = done)),
      }
    })
    const module = server.transform('/src/fns.ts', 'ssr')
    await Promise.race([reached, timedOut('no transform held')])
    // (armed now: the handler request of the call below)
    const arrived = new Promise<void>((r) => (handlerArrived = r))
    const call = callServerFn(server, url as string)
    await Promise.race([arrived, timedOut('no handler request')])
    // (the handler request goes on into the compiler)
    await new Promise((r) => setTimeout(r, 100))
    release()
    expect(await call).toBe('MARK_NEW')
    await module
    await server.idle()
    expect(reports).toEqual(['fns.ts -> ./secret.client'])
    expect(moduleTransforms).toBe(1)
  })
})
