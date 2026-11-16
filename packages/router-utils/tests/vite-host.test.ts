/**
 * The Vite host helpers outside a hot update: the stale set's modules sent
 * as updates (`reloadStaleModules`).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reloadStaleModules } from '../src/compiler'
import { MemoryHost } from './helpers'

describe('reloadStaleModules', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'reload-stale-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  /** A Vite environment of one module per file; records what is invalidated and sent. */
  function environment(files: Array<string>) {
    const nodes = new Map(files.map((file) => [file, { file }]))
    const invalidated: Array<string | null> = []
    const sent: Array<string | null> = []
    return {
      invalidated,
      sent,
      env: {
        name: 'client',
        moduleGraph: {
          getModulesByFile: (file: string) => {
            const node = nodes.get(file)
            return node ? new Set([node]) : undefined
          },
          invalidateModule: (node: { file: string | null }) => {
            invalidated.push(node.file)
          },
        },
        reloadModule: (node: { file: string | null }) => {
          sent.push(node.file)
          return Promise.resolve()
        },
        logger: { error: () => {} },
      },
    }
  }

  // a route file removed while its module was stale (a registry change
  // published without it): its removal is Vite's own event, which sends
  // what the page needs; an update of it now would make the page fetch a
  // file that is gone (coverage review D, D-1)
  it('invalidates the module of a file that is gone and sends no update for it', async () => {
    const kept = path.join(dir, 'kept.tsx')
    const gone = path.join(dir, 'gone.tsx')
    await writeFile(kept, 'export {}\n')
    const caches = new MemoryHost({ files: {} }).caches
    caches.stale.add('client', kept)
    caches.stale.add('client', gone)
    const { env, invalidated, sent } = environment([kept, gone])
    reloadStaleModules(caches, env, false, '[test]')
    expect(invalidated.sort()).toEqual([gone, kept].sort())
    expect(sent).toEqual([kept])
  })
})
