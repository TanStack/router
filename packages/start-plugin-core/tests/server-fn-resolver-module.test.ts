import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'
import {
  SERVER_FN_NOT_FOUND,
  isServerFnNotFound,
} from '@tanstack/start-server-core/constants'
import { generateServerFnResolverModule } from '../src/start-compiler/server-fn-resolver-module'

const KNOWN_SERVER_FN_ID = 'known-server-fn-id'
const STALE_SERVER_FN_ID = 'stale-server-fn-id'

const createdDirs: Array<string> = []

afterEach(async () => {
  await Promise.all(
    createdDirs
      .splice(0)
      .map((dir) => rm(dir, { force: true, recursive: true })),
  )
})

/**
 * The resolver is emitted as source text, so the only faithful way to observe
 * its runtime behaviour is to write it out and import it as a real module.
 */
async function loadGeneratedResolver(
  opts: { extractedFilename?: string } = {},
) {
  const source = generateServerFnResolverModule({
    serverFnsById: {
      [KNOWN_SERVER_FN_ID]: {
        functionName: 'knownServerFn',
        extractedFilename: opts.extractedFilename ?? './known-server-fn.mjs',
      } as never,
    },
    includeClientReferencedCheck: false,
  })

  const dir = await mkdtemp(join(tmpdir(), 'tsr-server-fn-resolver-'))
  createdDirs.push(dir)

  await writeFile(
    join(dir, 'known-server-fn.mjs'),
    'export const knownServerFn = () => "ok"\n',
    'utf8',
  )
  const modulePath = join(dir, 'resolver.mjs')
  await writeFile(modulePath, source, 'utf8')

  return (await import(pathToFileURL(modulePath).href)) as {
    getServerFnById: (
      id: string,
      access: { origin: 'client' | 'server' },
    ) => Promise<unknown>
  }
}

describe('generateServerFnResolverModule', () => {
  // The flag name is interpolated from `@tanstack/start-server-core`. If that
  // import ever resolves to a build without the constant, the emitted line
  // becomes `error[undefined] = true` — valid JS that silently drops the flag
  // and lets a stale id go back to being a 500.
  test('emits the not-found flag by name', () => {
    const source = generateServerFnResolverModule({
      serverFnsById: {},
      includeClientReferencedCheck: false,
    })

    expect(source).toContain(`error["${SERVER_FN_NOT_FOUND}"] = true`)
  })

  test('resolves a server function that is present in the manifest', async () => {
    const { getServerFnById } = await loadGeneratedResolver()

    const action = await getServerFnById(KNOWN_SERVER_FN_ID, {
      origin: 'client',
    })

    expect(typeof action).toBe('function')
  })

  test('flags an id that is absent from the manifest so the handler can answer 404', async () => {
    const { getServerFnById } = await loadGeneratedResolver()

    const error = await getServerFnById(STALE_SERVER_FN_ID, {
      origin: 'client',
    }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    )

    expect(isServerFnNotFound(error)).toBe(true)
  })

  // Only the request handler acts on the flag; every other caller of the resolver
  // (SSR RPC, the RSC action loader, the serialization adapter) keeps propagating
  // this value as-is, so it has to stay a real Error with a usable message.
  test('keeps the missing id reportable as a regular Error', async () => {
    const { getServerFnById } = await loadGeneratedResolver()

    const error = await getServerFnById(STALE_SERVER_FN_ID, {
      origin: 'client',
    }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    )

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(STALE_SERVER_FN_ID)
    expect((error as Error).stack).toBeTruthy()
  })

  test('leaves a resolution failure that is not a missing id unflagged', async () => {
    const { getServerFnById } = await loadGeneratedResolver({
      // A manifest entry whose module cannot be imported is a real server fault,
      // not a stale id, and must not be turned into a 404.
      extractedFilename: './does-not-exist.mjs',
    })

    const error = await getServerFnById(KNOWN_SERVER_FN_ID, {
      origin: 'client',
    }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    )

    expect(error).toBeInstanceOf(Error)
    expect(isServerFnNotFound(error)).toBe(false)
  })
})
