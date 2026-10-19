/**
 * Not part of the compiler test corpus (out of scope: filesystem metadata,
 * mode and owner, is outside SPEC J1.2, §1.2; FIX-PLAN GEN-16/GEN-17).
 * Characterisation of how the generator gives a route file it rewrites its
 * mode and owner back, and of its policy when it cannot. Atomic publication
 * itself (J1.6) is tested in concurrent-write.test.ts.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Generator, getConfig } from '../../src'
import { routeIdOf } from '../route-id'

const rootRouteSource = `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`

const oldRouteSource = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/old')({
  component: () => 'posts',
})
`

let tempDir: string | undefined

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

/** Reads a file and its modification time, like the generator's default filesystem. */
async function readFileWithStat(filePath: string) {
  try {
    const fileHandle = await fs.open(filePath, 'r')
    const stat = await fileHandle.stat({ bigint: true })
    const fileContent = (await fileHandle.readFile()).toString()
    await fileHandle.close()
    return { stat: { mtimeMs: stat.mtimeMs }, fileContent }
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      return 'file-not-existing' as const
    }
    throw e
  }
}

/**
 * Creates an app with a root route and `routes/posts.tsx` with a wrong id;
 * returns its paths and the configuration of a generator for it.
 */
async function createApp() {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-generator-metadata-'))
  const routesDirectory = path.join(tempDir, 'routes')
  const postsRoutePath = path.join(routesDirectory, 'posts.tsx')
  await fs.mkdir(routesDirectory)
  await fs.writeFile(path.join(routesDirectory, '__root.tsx'), rootRouteSource)
  await fs.writeFile(postsRoutePath, oldRouteSource)
  const config = getConfig(
    {
      disableLogging: true,
      routesDirectory,
      generatedRouteTree: path.join(tempDir, 'routeTree.gen.ts'),
      tmpDir: path.join(tempDir, 'tmp'),
    },
    tempDir,
  )
  return { root: tempDir, postsRoutePath, config }
}

describe('route files the generator rewrites', () => {
  it.skipIf(process.platform === 'win32')('keep their file mode', async () => {
    const { root, postsRoutePath, config } = await createApp()
    await fs.chmod(postsRoutePath, 0o600)
    await new Generator({ config, root }).run()

    expect(await routeIdOf(await fs.readFile(postsRoutePath, 'utf8'))).toBe(
      '/posts',
    )
    expect((await fs.stat(postsRoutePath)).mode & 0o777).toBe(0o600)
  })

  /**
   * A filesystem whose files have owners: real files, with their owners kept
   * in `owners` (files without an entry belong to the current user, 1000).
   * `chown` fails with `chownError` when given.
   */
  function filesystemWithOwners(
    owners: Map<string, { uid: number; gid: number }>,
    chownError?: string,
  ) {
    const currentUser = { uid: 1000, gid: 1000 }
    const key = (filePath: string) => path.resolve(filePath)
    return {
      rename: async (oldPath: string, newPath: string) => {
        await fs.rename(oldPath, newPath)
        owners.set(key(newPath), owners.get(key(oldPath)) ?? currentUser)
        owners.delete(key(oldPath))
      },
      writeFile: (filePath: string, content: string) =>
        fs.writeFile(filePath, content),
      readFile: (filePath: string) => readFileWithStat(filePath),
      stat: async (filePath: string) => {
        const stat = await fs.stat(filePath, { bigint: true })
        const owner = owners.get(key(filePath)) ?? currentUser
        return { mtimeMs: stat.mtimeMs, mode: Number(stat.mode), ...owner }
      },
      chmod: (filePath: string, mode: number) => fs.chmod(filePath, mode),
      chown: (filePath: string, uid: number, gid: number) => {
        if (chownError) {
          return Promise.reject(
            Object.assign(new Error(`chown ${chownError}`), {
              code: chownError,
            }),
          )
        }
        owners.set(key(filePath), { uid, gid })
        return Promise.resolve()
      },
    }
  }

  it.each([
    { owner: { uid: 1001, gid: 1000 } },
    { owner: { uid: 1000, gid: 1001 } },
  ])('keep their owner $owner', async ({ owner }) => {
    const { root, postsRoutePath, config } = await createApp()
    const owners = new Map([[postsRoutePath, owner]])
    await new Generator({
      config,
      root,
      fs: filesystemWithOwners(owners),
    }).run()

    expect(await routeIdOf(await fs.readFile(postsRoutePath, 'utf8'))).toBe(
      '/posts',
    )
    expect(owners.get(postsRoutePath)).toEqual(owner)
  })

  it('are still fixed, with a warning, when their owner cannot be given back', async () => {
    const { root, postsRoutePath, config } = await createApp()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await new Generator({
        config,
        root,
        fs: filesystemWithOwners(
          new Map([[postsRoutePath, { uid: 0, gid: 0 }]]),
          'EPERM',
        ),
      }).run()
      expect(warn.mock.calls.flat().join('\n')).toContain('chown')
    } finally {
      warn.mockRestore()
    }
    expect(await routeIdOf(await fs.readFile(postsRoutePath, 'utf8'))).toBe(
      '/posts',
    )
  })

  it('are left as they are when giving their owner back fails otherwise, and the run fails', async () => {
    const { root, postsRoutePath, config } = await createApp()
    await expect(
      new Generator({
        config,
        root,
        fs: filesystemWithOwners(
          new Map([[postsRoutePath, { uid: 0, gid: 0 }]]),
          'EIO',
        ),
      }).run(),
    ).rejects.toThrow('chown EIO')
    await expect(fs.readFile(postsRoutePath, 'utf8')).resolves.toBe(
      oldRouteSource,
    )
  })
})
