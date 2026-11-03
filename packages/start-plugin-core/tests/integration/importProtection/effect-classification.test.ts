/**
 * Whether a dead re-export of a denied module is reported depends on whether
 * evaluating the module has effects. What the bundler would keep decides: the
 * size of the module's graph, a platform builtin or the framework's runtime it
 * imports do not make it effectful. An effect at the end of a long chain is
 * still one.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import {
  rejection,
  reportedViolations,
} from '../../importProtection/start-apps'

const timeout = 60_000

/** A chain of `length` modules; `last` is the code of its last one. */
function chain(length: number, last: string) {
  const files: Record<string, string> = {}
  for (let i = 0; i < length - 1; i++) {
    files[`src/d/m${i}.ts`] =
      `import { c${i + 1} } from './m${i + 1}'\nexport const c${i} = () => c${i + 1}()\n`
  }
  files[`src/d/m${length - 1}.ts`] = last
  return files
}

const deadBarrel = (target: Record<string, string>) => ({
  ...target,
  'src/barrel.ts': `export { secret } from './s.server'
export const safe = () => 'MARK_SAFE'
`,
  'src/entry.ts': `export { safe } from './barrel'\n`,
})

const pureEnd = `export const c299 = () => 1\n`
const throughChain = `import { c0 } from './d/m0'
export const secret = () => c0() + 'MARK_SECRET'
`

describe.each(startBundlers)('%s build', (bundler) => {
  test.each([
    {
      name: 'a pure graph of 300 modules',
      target: {
        ...chain(300, pureEnd),
        'src/s.server.ts': throughChain,
      },
    },
    {
      name: 'a builtin',
      target: {
        'src/s.server.ts': `import { readFileSync } from 'node:fs'
export const secret = () => readFileSync('x') + 'MARK_SECRET'
`,
      },
    },
    {
      name: "the framework's server runtime",
      target: {
        'src/s.server.ts': `import { getRequest } from '@tanstack/react-start/server'
export const secret = () => String(getRequest) + 'MARK_SECRET'
`,
      },
    },
  ])(
    'a dead re-export of a denied module importing $name is not reported',
    async ({ target }) => {
      const { client, violations } = await buildStart({
        bundler,
        files: deadBarrel(target),
        entry: 'src/entry.ts',
      })
      expect(violations).toEqual([])
      expect(client.where('MARK_SECRET')).toBe('nowhere')
    },
    timeout,
  )

  test(
    'a bare import of a denied module whose only effect is an external URL is reported',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/s.server.ts': `import 'https://cdn.example.com/x.js'\nexport {}\n`,
            'src/entry.ts': `import './s.server'\nexport const read = () => 1\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(
        reportedViolations(error).map(({ environment }) => environment),
      ).toContain('client')
    },
    timeout,
  )

  test(
    'an unused import of a denied module with an effect at the end of 300 modules is reported',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...chain(
              300,
              `;(globalThis as Record<string, unknown>).fx = 1\nexport const c299 = () => 1\n`,
            ),
            'src/s.server.ts': throughChain,
            'src/mid.js': `import { secret } from './s.server'
export const safe = () => 'MARK_SAFE'
`,
            'src/entry.ts': `export { safe } from './mid.js'\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(
        reportedViolations(error).map(({ environment }) => environment),
      ).toContain('client')
    },
    timeout,
  )
})
