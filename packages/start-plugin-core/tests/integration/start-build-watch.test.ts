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
import {
  pageEntries,
  rootDocument,
  routerFile,
  startPageEntries,
} from './start-compose-app'

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

  test(
    'a server fn a module of both environments stops importing is refused over HTTP by the rebuilt server',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          ...files,
          'old.ts': `import { createServerFn } from '@tanstack/react-start'
export const old = createServerFn().handler(async () => 'MARK_OLD')
`,
          'shared.ts': `export { greet } from './fns'
export { old } from './old'
`,
          'client-entry.ts': `export * from './shared'
`,
          'ssr-entry.ts': `export * from './shared'
export { old } from './old'
${callByIdExports}`,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        watchEdits: {
          'shared.ts': `export { greet } from './fns'
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
    'an allowed import writes its client, and an edit keeps it working',
    async () => {
      const denied = (mark: string) => `export const secret = () => '${mark}'\n`
      const { client, firstBuild } = await buildStart({
        bundler,
        files: {
          'src/lib.server.ts': denied('MARK_BEFORE'),
          'src/entry.ts': `import { secret } from './lib.server'
export const read = () => secret()
`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { allowImport: () => true } },
        watchEdits: { 'src/lib.server.ts': denied('MARK_AFTER') },
      })
      expect(firstBuild.filter(({ severity }) => severity === 'error')).toEqual(
        [],
      )
      expect((await client.run(`return entry.read()`)).result).toBe(
        'MARK_AFTER',
      )
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

  // Source: review round 3 (R3-G5-4: the Rsbuild host reported the
  // allocator's error once per watch session).
  test(
    'an invalid custom server fn id fails the rebuild too',
    async () => {
      const result = await buildStart({
        bundler,
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        start: { serverFns: { generateFunctionId: () => 'a/b' } },
        watchEdits: {
          'greeting.ts': `export const greeting = 'MARK_AFTER'
`,
        },
      }).then(
        () => null,
        (error: unknown) => error,
      )
      expect(result, 'the rebuild fails').toBeInstanceOf(Error)
    },
    timeout,
  )

  // Source: review round 3 (R3-G4-1): the server's rebuild embedded the
  // manifest of the previous client build, so its documents named client
  // files the rebuild no longer emits.
  test(
    'the rebuilt server renders documents that load the rebuilt client files',
    async () => {
      const index = (
        marker: string,
      ) => `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>${marker}</p> })
`
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          ...startPageEntries,
          ...pageEntries,
          'src/router.ts': routerFile,
          'src/routes/__root.tsx': rootDocument(),
          'src/routes/index.tsx': index('MARK_BEFORE'),
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        watchEdits: { 'src/routes/index.tsx': index('MARK_AFTER') },
      })
      expect(client.where('MARK_AFTER')).not.toBe('nowhere')
      const { result: html } = await ssr.run(
        `return await (await entry.startServerEntry.fetch(new Request('http://localhost/'))).text()`,
      )
      const named = [
        ...(html as string).matchAll(/["']\/([^"'\s]+?\.js)["']/g),
      ].map((m) => m[1]!)
      const emitted = new Set(client.chunks.map((c) => c.fileName))
      expect(named.length).toBeGreaterThan(0)
      expect(named.filter((file) => !emitted.has(file))).toEqual([])
    },
    timeout,
  )
})
