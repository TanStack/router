/**
 * `vite build --watch` and `rsbuild build --watch` of a Start app: the first
 * build succeeds, and an edit of a module both environments bundle rebuilds
 * them with it; the client's server fn is still served by the rebuilt server
 * (Start's own server entry, inside a real request). A rebuild judges an
 * unchanged module against what the edit changed in the modules it imports.
 */
import { describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import { rejection, reportedViolations } from '../importProtection/start-apps'

const timeout = 60_000

const files = {
  'greeting.ts': `export const greeting = 'MARK_BEFORE'
`,
  'fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { greeting } from './greeting'
export const greet = createServerFn().handler(async () => greeting)
`,
  'client-entry.ts': `export { greet } from './fns'
export { greeting } from './greeting'
`,
  'ssr-entry.ts': `export { greet } from './fns'
${callByIdExports}`,
}

describe.each(startBundlers)('%s build --watch', (bundler) => {
  test(
    'the first build succeeds and an edit rebuilds both environments',
    async () => {
      const { client, ssr, firstBuild } = await buildStart({
        bundler,
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        watchEdits: {
          'greeting.ts': `export const greeting = 'MARK_AFTER'
`,
        },
      })
      expect(firstBuild.filter(({ severity }) => severity === 'error')).toEqual(
        [],
      )
      expect((await client.run(`return entry.greeting`)).result).toBe(
        'MARK_AFTER',
      )
      const url = (await client.run(`return entry.greet.url`)).result
      const { result } = await ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe('MARK_AFTER')
    },
    timeout,
  )

  test(
    'a server fn module an edit deletes leaves the rebuilt server',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          ...files,
          'old.ts': `import { createServerFn } from '@tanstack/react-start'
export const old = createServerFn().handler(async () => 'MARK_OLD')
`,
          'client-entry.ts': `export { greet } from './fns'
export { old } from './old'
`,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        watchEdits: {
          'old.ts': null,
          'client-entry.ts': `export { greet } from './fns'
`,
        },
      })
      expect(ssr.where('MARK_OLD')).toBe('nowhere')
    },
    timeout,
  )

  // Bug on Vite (main too: its map is never cleared): a watch rebuild keeps
  // the client snapshot of a module the client no longer compiles, so the
  // rebuilt resolver still lists the server fn as client-referenced.
  ;(bundler === 'vite' ? test.fails : test)(
    'a server fn the client stops importing is refused over HTTP by the rebuilt server',
    async () => {
      const ssrEntry = `export { greet } from './fns'
export { old } from './old'
${callByIdExports}`
      const { ssr } = await buildStart({
        bundler,
        files: {
          ...files,
          'old.ts': `import { createServerFn } from '@tanstack/react-start'
export const old = createServerFn().handler(async () => 'MARK_OLD')
`,
          'client-entry.ts': `export { greet } from './fns'
export { old } from './old'
`,
          'ssr-entry.ts': ssrEntry,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        watchEdits: {
          'client-entry.ts': `export { greet } from './fns'
`,
        },
      })
      const { result } =
        await ssr.run(`${callByIdPrelude}const settle = async (run) => {
  try {
    return await run()
  } catch {
    return 'rejected'
  }
}
return {
  overHttp: await settle(() => callById(serverFnId(entry.old))),
  fromSsr: await settle(() => entry.old()),
}`)
      // (from SSR code it still works: the server fn is in the resolver)
      expect(result).toEqual({ overHttp: 'rejected', fromSsr: 'MARK_OLD' })
    },
    timeout,
  )

  test(
    'a module an edit marks server-only is a violation of its unchanged client importer',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/lib.ts': `export const secret = () => 'MARK_SECRET'
`,
            'src/other.ts': `import { secret } from './lib'
export const read = () => secret()
`,
            'src/entry.ts': `export { read } from './other'
`,
          },
          entry: 'src/entry.ts',
          watchEdits: {
            'src/lib.ts': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`,
          },
        }),
      )
      expect(
        reportedViolations(error).map(({ environment }) => environment),
      ).toContain('client')
    },
    timeout,
  )
})
