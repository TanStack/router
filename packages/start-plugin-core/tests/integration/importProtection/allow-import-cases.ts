/**
 * `allowImport` and `onViolation` on real builds (Vite and Rsbuild), through
 * Start's public option: what the client gets, what is reported, and how many
 * times each callback runs, for each kind of violation and each answer.
 * Development: dev.test.ts, v2-policy.test.ts, v2-witness.test.ts.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import { rejection } from '../../importProtection/start-apps'
import type { StartBundler } from '../../build-harness'
import type { ImportProtectionOptions } from '../../importProtection/public-types'

const timeout = 60_000

const kinds: Record<
  'file' | 'specifier' | 'marker',
  {
    options: ImportProtectionOptions
    files: Record<string, string>
    specifier: string
  }
> = {
  file: {
    options: {},
    files: {
      'src/target.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
    },
    specifier: './target.server',
  },
  specifier: {
    options: { client: { specifiers: ['./target'] } },
    files: { 'src/target.ts': `export const secret = () => 'MARK_SECRET'\n` },
    specifier: './target',
  },
  marker: {
    options: {},
    files: {
      'src/target.ts': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`,
    },
    specifier: './target',
  },
}

function matrixApp(kind: keyof typeof kinds) {
  return {
    ...kinds[kind].files,
    'src/entry.ts': `import { secret } from '${kinds[kind].specifier}'
export const read = () => String(secret())
`,
  }
}

const relevant = (infos: Array<{ importer: string }>) =>
  infos.filter((info) => info.importer.endsWith('/src/entry.ts'))

export function describeAllowImport(bundler: StartBundler) {
  describe.each(['error', 'mock'] as const)('behavior %s', (behavior) => {
    describe.each(Object.keys(kinds) as Array<keyof typeof kinds>)(
      '%s violation',
      (kind) => {
        const run = (answer: boolean | undefined) => {
          const allowed: Array<{ importer: string }> = []
          const told: Array<{ importer: string; trace: Array<unknown> }> = []
          const build = buildStart({
            bundler,
            files: matrixApp(kind),
            entry: 'src/entry.ts',
            start: {
              importProtection: {
                ...kinds[kind].options,
                behavior,
                mockAccess: 'off',
                allowImport: (info) => {
                  allowed.push(info)
                  return answer
                },
                onViolation: (info) => {
                  told.push(info)
                },
              },
            },
          })
          return { build, allowed, told }
        }

        test(
          'true: the real module, from the only pass; no report',
          async () => {
            const { build, allowed, told } = run(true)
            const { client, diagnostics } = await build
            expect((await client.run(`return entry.read()`)).result).toBe(
              'MARK_SECRET',
            )
            expect(relevant(allowed)).toHaveLength(1)
            expect(told).toEqual([])
            expect(
              diagnostics.filter((d) => /import-protection/.test(d.text)),
            ).toEqual([])
          },
          timeout,
        )

        test.each(kind === 'file' ? [false, undefined] : [undefined])(
          '%s: the normal outcome under the behavior, reported once',
          async (answer) => {
            const { build, allowed, told } = run(answer)
            if (behavior === 'error') {
              await rejection(build)
            } else {
              const { client } = await build
              expect(client.where('MARK_SECRET')).toBe('nowhere')
              expect((await client.run(`return entry.read()`)).result).not.toBe(
                'MARK_SECRET',
              )
            }
            expect(relevant(allowed)).toHaveLength(1)
            expect(relevant(told)).toHaveLength(1)
            expect(told[0]!.trace.length).toBeGreaterThan(0)
          },
          timeout,
        )
      },
    )
  })

  test(
    'allowImport also sees an import tree-shaking removes; onViolation does not hear about it',
    async () => {
      const allowed: Array<string> = []
      const told: Array<string> = []
      const { client } = await buildStart({
        bundler,
        files: {
          'src/s.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
          'src/barrel.ts': `export { secret } from './s.server'\nexport const safe = () => 'MARK_SAFE'\n`,
          'src/entry.ts': `export { safe } from './barrel'\n`,
        },
        entry: 'src/entry.ts',
        start: {
          importProtection: {
            allowImport: (info) => {
              allowed.push(info.specifier)
            },
            onViolation: (info) => {
              told.push(info.specifier)
            },
          },
        },
      })
      expect(allowed).toEqual(['./s.server'])
      expect(told).toEqual([])
      expect(client.where('MARK_SECRET')).toBe('nowhere')
    },
    timeout,
  )

  test(
    'allowImport is told about the import, without a trace or a snippet',
    async () => {
      let seen: Record<string, unknown> | undefined
      await buildStart({
        bundler,
        files: matrixApp('file'),
        entry: 'src/entry.ts',
        start: {
          importProtection: {
            allowImport: (info) => {
              seen = { ...info }
              return true
            },
          },
        },
      })
      expect(seen).toMatchObject({
        env: 'client',
        envType: 'client',
        type: 'file',
        behavior: 'error',
        specifier: './target.server',
        importerLoc: { line: 1 },
      })
      expect(seen!.importer).toMatch(/\/src\/entry\.ts$/)
      expect(seen!.resolved).toMatch(/\/src\/target\.server\.ts$/)
      expect(Object.keys(seen!)).not.toContain('trace')
    },
    timeout,
  )

  test(
    'onViolation returning false says what to use instead, and the outcome stays',
    async () => {
      const { client, diagnostics } = await buildStart({
        bundler,
        files: matrixApp('file'),
        entry: 'src/entry.ts',
        start: {
          importProtection: {
            behavior: 'mock',
            mockAccess: 'off',
            onViolation: (() => false) as () => void,
          },
        },
      })
      expect(client.where('MARK_SECRET')).toBe('nowhere')
      expect(diagnostics.map((d) => d.text).join('\n')).toMatch(/allowImport/)
    },
    timeout,
  )
}
