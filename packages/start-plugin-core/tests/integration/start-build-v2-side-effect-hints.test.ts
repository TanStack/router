/**
 * Start's hard rule (SPEC J4.12) in real production builds, through Start's
 * Vite and Rsbuild plugins (build-harness.ts), with the side-effect hints
 * bundlers read varied: the server side of each construct (handler,
 * validator, middleware `.server()`, `createServerOnlyFn`) depends on
 * packages declaring `sideEffects: true`, `false` and an array, and a
 * server fn module has top-level initializers with and without
 * `@__PURE__`. The surviving client code works and calls the server by id.
 * One app per bundler also covers a dynamic `import()` inside a handler, a
 * server fn module consumed statically, dynamically and through a barrel, a
 * validator schema a client form also uses and non-JS modules whose text
 * contains `createServerFn(` (SPEC J4.1, J4.7, J4.12, J4.14, G2, G3, §2.1).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import type { StartBuild, StartBundler } from '../build-harness'

const timeout = 60_000

/**
 * A dependency package `name` with the given `sideEffects` hint: its module
 * records that it loaded and exports one function per construct, each
 * returning a marker that names the package (`MARK_<TAG>_<CONSTRUCT>`).
 * The array hint names a second module with a side effect, imported by the
 * first.
 */
function dependency(
  name: string,
  tag: string,
  sideEffects: boolean | Array<string>,
) {
  const constructs = ['Handler', 'Validator', 'Middleware', 'ServerOnly']
  return {
    [`node_modules/${name}/package.json`]: JSON.stringify({
      name,
      type: 'module',
      exports: { '.': './index.js', './effect': './effect.js' },
      sideEffects,
    }),
    [`node_modules/${name}/effect.js`]: `globalThis.MARK_${tag}_EFFECT = 'loaded'\n`,
    [`node_modules/${name}/index.js`]: `import './effect.js'
globalThis.MARK_${tag}_LOADED = 'loaded'
${constructs
  .map(
    (construct) =>
      `export const for${construct} = () => 'MARK_${tag}_${construct.toUpperCase()}'`,
  )
  .join('\n')}
`,
  }
}

/** The dependency packages, by the hint they declare. */
const dependencies = {
  ...dependency('deps-true', 'TRUE', true),
  ...dependency('deps-false', 'FALSE', false),
  ...dependency('deps-array', 'ARRAY', ['./effect.js']),
}
const dependencyTags = ['TRUE', 'FALSE', 'ARRAY']
const dependencyImports = `import * as depsTrue from 'deps-true'
import * as depsFalse from 'deps-false'
import * as depsArray from 'deps-array'
`
/** One marker per package, from the function of `construct`. */
const marksOf = (construct: string) =>
  `[depsTrue.for${construct}(), depsFalse.for${construct}(), depsArray.for${construct}()]`
const expectedMarks = (construct: string) =>
  dependencyTags.map((tag) => `MARK_${tag}_${construct.toUpperCase()}`)

/**
 * `src/text.ts`: the non-JS modules' text. `?raw` is Vite's (Rspack
 * parses the query-less `.md` as JavaScript: not a Start matter), so the
 * Rsbuild app imports the JSON only.
 */
const textModule = (bundler: StartBundler) =>
  bundler === 'vite'
    ? `import notes from './notes.md?raw'
import data from './data.json'
export const rawText = () => ({ notes, code: data.code })
`
    : `import data from './data.json'
export const rawText = () => ({ code: data.code })
`

const files = {
  ...dependencies,
  // Each construct in a module of its own, so a leak names its construct.
  'src/fns/handler.ts': `import { createServerFn } from '@tanstack/react-start'
${dependencyImports}export const viaHandler = createServerFn().handler(async () => ${marksOf('Handler')})
`,
  'src/fns/validator.ts': `import { createServerFn } from '@tanstack/react-start'
${dependencyImports}export const viaValidator = createServerFn()
  .validator((input: unknown) => ({ input: String(input), marks: ${marksOf('Validator')} }))
  .handler(async ({ data }) => data)
`,
  'src/fns/middleware.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
${dependencyImports}const marks = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { marks: ${marksOf('Middleware')} } }),
)
export const viaMiddleware = createServerFn()
  .middleware([marks])
  .handler(async ({ context }) => context.marks)
`,
  'src/fns/server-only.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
${dependencyImports}export const serverOnlyMarks = createServerOnlyFn(() => ${marksOf('ServerOnly')})
`,
  // Top-level initializers next to a server fn: one annotated pure, one
  // not; the client reads one of them, the handler both and a server-only
  // store (a neutral file name: the compiler alone decides its absence).
  'src/registry.ts': `export function createRegistry(name: string) {
  ;((globalThis as Record<string, unknown>).__registries ??= []) as Array<string>
  ;((globalThis as Record<string, unknown>).__registries as Array<string>).push(name)
  return { name }
}
`,
  'src/secret-store.ts': `export const secretStore = { count: () => 'MARK_SECRET_STORE' }\n`,
  'src/init.ts': `import { createServerFn } from '@tanstack/react-start'
import { createRegistry } from './registry'
import { secretStore } from './secret-store'
const pureRegistry = /*#__PURE__*/ createRegistry('MARK_PURE_REGISTRY')
const registry = createRegistry('MARK_REGISTRY')
export const countSecrets = createServerFn().handler(async () => [
  registry.name,
  pureRegistry.name,
  secretStore.count(),
])
export const registryName = () => registry.name
`,
  // A dynamic import inside the handler.
  'src/vault.server.ts': `export const secret = () => 'MARK_VAULT_SECRET'\n`,
  'src/fns/dynamic.ts': `import { createServerFn } from '@tanstack/react-start'
export const readVault = createServerFn().handler(async () => {
  const { secret } = await import('../vault.server')
  return secret()
})
`,
  // A server fn module with secret canaries, consumed three ways.
  'src/canaries/handler-canary.ts': `export const canaryHandler = (data: unknown) =>
  'MARK_CANARY_HANDLER:' + JSON.stringify(data)
`,
  'src/canaries/validator-canary.ts': `export const canaryValidator = (input: unknown) => {
  if (input === 'MARK_CANARY_VALIDATOR') {
    throw new Error('rejected')
  }
  return input
}
`,
  'src/fns/target.ts': `import { createServerFn } from '@tanstack/react-start'
import { canaryHandler } from '../canaries/handler-canary'
import { canaryValidator } from '../canaries/validator-canary'
;(((globalThis as Record<string, unknown>).__targetInits ??= []) as Array<string>).push('target')
export const getTarget = createServerFn()
  .validator((input: unknown) => canaryValidator(input))
  .handler(async ({ data }) => canaryHandler(data))
`,
  'src/fns/index.ts': `export * from './target'\n`,
  // A schema the client form also validates with, and one only a
  // validator uses.
  'src/post-schema.ts': `export interface Post {
  title: string
}
export function PostSchema(input: unknown): Post {
  if (typeof (input as Post | null)?.title !== 'string') {
    throw new Error('MARK_INVALID_POST')
  }
  return { title: (input as Post).title }
}
`,
  'src/draft-schema.ts': `export function DraftSchema(input: unknown): { body: string } {
  if (typeof (input as { body?: unknown } | null)?.body !== 'string') {
    throw new Error('MARK_INVALID_DRAFT')
  }
  return { body: (input as { body: string }).body }
}
`,
  'src/fns/posts.ts': `import { createServerFn } from '@tanstack/react-start'
import { PostSchema } from '../post-schema'
import { DraftSchema } from '../draft-schema'
export const createPost = createServerFn()
  .validator(PostSchema)
  .handler(async ({ data }) => ({ saved: data }))
export const saveDraft = createServerFn()
  .validator(DraftSchema)
  .handler(async ({ data }) => ({ saved: data }))
export function validateForm(input: unknown) {
  return PostSchema(input)
}
`,
  // Non-JS modules whose text contains the detection pattern.
  'src/notes.md': `# Notes

Call \`createServerFn(\` from a route; \`createMiddleware(\` too.
`,
  'src/data.json': JSON.stringify({
    code: 'createServerFn().handler(() => 1)',
  }),
  'src/client-entry.ts': `export { viaHandler } from './fns/handler'
export { viaValidator } from './fns/validator'
export { viaMiddleware } from './fns/middleware'
export { serverOnlyMarks } from './fns/server-only'
export { countSecrets, registryName } from './init'
export { readVault } from './fns/dynamic'
export { getTarget as viaStatic } from './fns/target'
export const viaDynamic = async () => (await import('./fns/target')).getTarget
export { getTarget as viaBarrel } from './fns'
export { createPost, saveDraft, validateForm } from './fns/posts'
export { rawText } from './text'
`,
  'src/ssr-entry.ts': `export * from './client-entry'
${callByIdExports}`,
}

/**
 * The client's server fns, as a client script returns them: each by its
 * public URL (the server fn base, then its id).
 */
const clientUrls = `return {
  viaHandler: entry.viaHandler.url,
  viaValidator: entry.viaValidator.url,
  viaMiddleware: entry.viaMiddleware.url,
  countSecrets: entry.countSecrets.url,
  readVault: entry.readVault.url,
  viaStatic: entry.viaStatic.url,
  viaDynamic: (await entry.viaDynamic()).url,
  viaBarrel: entry.viaBarrel.url,
  createPost: entry.createPost.url,
  saveDraft: entry.saveDraft.url,
}`

describe.each(startBundlers)('%s build', (bundler) => {
  // One build for every row; the runs are independent (browser pages and
  // Node processes).
  let build: StartBuild
  let urls: Record<string, string>
  let dispose: (() => Promise<void>) | undefined
  beforeAll(async () => {
    build = await buildStart({
      bundler,
      files: { ...files, 'src/text.ts': textModule(bundler) },
      entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
    urls = (await build.client.run(clientUrls)).result as Record<string, string>
  }, timeout)
  afterAll(() => dispose?.())

  describe.concurrent('server code under side-effect hints', () => {
    test.each([
      { construct: 'a handler', name: 'viaHandler', tag: 'Handler' },
      { construct: 'a validator', name: 'viaValidator', tag: 'Validator' },
      {
        construct: 'a middleware .server()',
        name: 'viaMiddleware',
        tag: 'Middleware',
      },
    ])(
      "$construct's dependencies (sideEffects true, false, array) are not in the client bundle, and the server fn runs by id",
      async ({ name, tag }) => {
        const marks = expectedMarks(tag)
        for (const mark of marks) {
          expect(build.client.where(mark), mark).toBe('nowhere')
        }
        const { result } = await build.ssr.run(
          `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(urls[name])}), 'input')`,
        )
        expect(result).toEqual(
          tag === 'Validator' ? { input: 'input', marks } : marks,
        )
      },
    )

    test("a createServerOnlyFn body's dependencies are not in the client bundle; the server runs it, the client is refused", async () => {
      const marks = expectedMarks('ServerOnly')
      for (const mark of marks) {
        expect(build.client.where(mark), mark).toBe('nowhere')
      }
      expect(
        (await build.ssr.run(`return entry.serverOnlyMarks()`)).result,
      ).toEqual(marks)
      const { result } = await build.client.run(
        `try { return { value: entry.serverOnlyMarks() } } catch (error) { return { name: error.name, message: error.message } }`,
      )
      // (it threw: the call is refused)
      expect(result).toEqual({
        name: expect.any(String),
        message: expect.any(String),
      })
    })

    test('no dependency package loads in the client, whatever its hint', async () => {
      for (const tag of dependencyTags) {
        expect(build.client.where(`MARK_${tag}_LOADED`), tag).toBe('nowhere')
        expect(build.client.where(`MARK_${tag}_EFFECT`), tag).toBe('nowhere')
      }
      const { result } = await build.client.run(
        `return Object.keys(globalThis).filter((key) => key.startsWith('MARK_'))`,
      )
      expect(result).toEqual([])
    })

    // The initializer the client reads runs once there; the pure one may
    // go (SPEC G3: eager vs lazy initialization of a server-only binding is
    // not pinned); the server-only store never reaches the client.
    test('top-level initializers with and without @__PURE__ next to a server fn', async () => {
      expect(build.client.where('MARK_SECRET_STORE')).toBe('nowhere')
      const client = (
        await build.client.run(
          `return { name: entry.registryName(), registries: globalThis.__registries }`,
        )
      ).result as { name: string; registries: Array<string> }
      expect(client.name).toBe('MARK_REGISTRY')
      expect(
        client.registries.filter((name) => name === 'MARK_REGISTRY'),
      ).toEqual(['MARK_REGISTRY'])
      expect(
        client.registries.filter((name) => name === 'MARK_PURE_REGISTRY')
          .length,
      ).toBeLessThanOrEqual(1)
      const ssr = (
        await build.ssr.run(`${callByIdPrelude}return {
  byId: await callById(serverFnId(${JSON.stringify(urls.countSecrets)})),
  name: entry.registryName(),
  registries: globalThis.__registries,
}`)
      ).result as {
        byId: Array<string>
        name: string
        registries: Array<string>
      }
      expect(ssr.byId).toEqual([
        'MARK_REGISTRY',
        'MARK_PURE_REGISTRY',
        'MARK_SECRET_STORE',
      ])
      expect(ssr.name).toBe('MARK_REGISTRY')
      // (How many times the SSR bundle initialises the module is the pin
      // "SSR: a server fn module is initialised once and shares its state
      // with SSR code" of known-bugs-start-compiler.test.ts: the SSR
      // caller and the provider are two instances today.)
      expect(ssr.registries).toEqual(
        expect.arrayContaining(['MARK_PURE_REGISTRY', 'MARK_REGISTRY']),
      )
    })
  })

  test('a dynamic import inside a handler: no client chunk carries its target, the call by id returns its value', async () => {
    expect(build.client.where('MARK_VAULT_SECRET')).toBe('nowhere')
    const { result } = await build.ssr.run(
      `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(urls.readVault)}))`,
    )
    expect(result).toBe('MARK_VAULT_SECRET')
  })

  // Source: docs server-functions.md ("avoid dynamic imports").
  test('a server fn module consumed statically, dynamically and through a barrel: one id, no canary in the client, top-level code once per env', async () => {
    expect(urls.viaDynamic).toBe(urls.viaStatic)
    expect(urls.viaBarrel).toBe(urls.viaStatic)
    expect(
      build.client.where(/MARK_CANARY_HANDLER|MARK_CANARY_VALIDATOR/),
    ).toBe('nowhere')
    const client = (
      await build.client.run(`await entry.viaDynamic()
return globalThis.__targetInits`)
    ).result
    expect(client).toEqual(['target'])
    const { result } = await build.ssr.run(`${callByIdPrelude}return {
  byId: await callById(serverFnId(${JSON.stringify(urls.viaStatic)}), 'in'),
  rejected: await callById(serverFnId(${JSON.stringify(urls.viaStatic)}), 'MARK_CANARY_VALIDATOR').then(
    () => 'resolved',
    (error) => error.message,
  ),
  ssr: await entry.viaStatic({ data: 'ssr' }),
  inits: globalThis.__targetInits,
}`)
    expect(result).toEqual({
      byId: 'MARK_CANARY_HANDLER:"in"',
      rejected: 'rejected',
      ssr: 'MARK_CANARY_HANDLER:"ssr"',
      // Once per SSR instance of the module (the SSR caller and provider
      // instances are the known-bugs pin cited above).
      inits: expect.arrayContaining(['target']),
    })
  })

  test('a validator schema the client form also uses stays with its behaviour; a validator-only schema is gone', async () => {
    expect(build.client.where('MARK_INVALID_DRAFT')).toBe('nowhere')
    const client = (
      await build.client.run(`return {
  valid: entry.validateForm({ title: 'hello' }),
  invalid: (() => { try { entry.validateForm({}) } catch (error) { return error.message } })(),
}`)
    ).result
    expect(client).toEqual({
      valid: { title: 'hello' },
      invalid: 'MARK_INVALID_POST',
    })
    const { result } = await build.ssr
      .run(`${callByIdPrelude}const call = (url, data) =>
  callById(serverFnId(url), data).then((value) => ({ value }), (error) => ({ error: error.message }))
return {
  post: await call(${JSON.stringify(urls.createPost)}, { title: 'hello' }),
  invalidPost: await call(${JSON.stringify(urls.createPost)}, { nope: true }),
  draft: await call(${JSON.stringify(urls.saveDraft)}, { body: 'draft' }),
  invalidDraft: await call(${JSON.stringify(urls.saveDraft)}, {}),
}`)
    expect(result).toEqual({
      post: { value: { saved: { title: 'hello' } } },
      invalidPost: { error: 'MARK_INVALID_POST' },
      draft: { value: { saved: { body: 'draft' } } },
      invalidDraft: { error: 'MARK_INVALID_DRAFT' },
    })
  })

  // Source: #5525 (regression guard).
  test('non-JS modules whose text contains createServerFn( are imported byte for byte', async () => {
    const expected = {
      ...(bundler === 'vite' && { notes: files['src/notes.md'] }),
      code: JSON.parse(files['src/data.json']).code,
    }
    for (const env of ['client', 'ssr'] as const) {
      expect(
        (await build[env].run(`return entry.rawText()`)).result,
        env,
      ).toEqual(expected)
    }
  })
})
