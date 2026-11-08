/**
 * Awaiting the mock of a denied import, on real builds (the client in a
 * browser page, the server in a child process, both bounded): code that awaits
 * what it imported, a promise chain on what a mock returns, a value returned
 * from an async function. On a mock that resolves to itself each of those is
 * a microtask loop that freezes the tab or the whole server.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'

const timeout = 60_000

const script = `${describeValuePrelude}
const logged = []
console.error = (...args) => logged.push(String(args[0]?.message ?? args[0]))
const mock = entry.read()
const awaited = await mock
// (a mocked import reports its first use: this is it)
const before = logged.length
awaited.deep.used()
const reportedAfterAwait = logged.length > before
const resolved = await Promise.resolve(mock)
const returned = await (async () => mock)()
let received
const chained = await mock.member().then((value) => {
  received = describeValue(value, 'MARK_SECRET')
  return 'chain result'
})
const caught = await mock.catch(() => 'not called')
let finallyRan = false
await mock.finally(() => {
  finallyRan = true
})
return {
  awaited: describeValue(awaited, 'MARK_SECRET'),
  resolved: describeValue(resolved, 'MARK_SECRET'),
  returned: describeValue(returned, 'MARK_SECRET'),
  received,
  chained,
  caught: describeValue(caught, 'MARK_SECRET'),
  finallyRan,
  reportedAfterAwait,
}`

const safe = 'a safe mock'

describe.each(startBundlers)('%s build, an awaited mock', (bundler) => {
  test.each([
    {
      env: 'client',
      file: 'src/secret.server.ts',
      importedAs: './secret.server',
    },
    { env: 'ssr', file: 'src/secret.client.ts', importedAs: './secret.client' },
  ] as const)(
    '$env: settles to a mock, and a use of it is still reported',
    async ({ env, file, importedAs }) => {
      const built = await buildStart({
        bundler,
        files: {
          [file]: `export const secret = () => 'MARK_SECRET'\n`,
          'src/entry.ts': `import { secret } from '${importedAs}'
export const read = () => secret
`,
          'src/other.ts': `export const read = () => 'other'\n`,
        },
        entry:
          env === 'client'
            ? 'src/entry.ts'
            : { client: 'src/other.ts', ssr: 'src/entry.ts' },
        start: { importProtection: { behavior: 'mock' } },
      })
      expect((await built[env].run(script)).result).toEqual({
        awaited: safe,
        resolved: safe,
        returned: safe,
        received: safe,
        chained: 'chain result',
        caught: safe,
        finallyRan: true,
        reportedAfterAwait: true,
      })
    },
    timeout,
  )
})
