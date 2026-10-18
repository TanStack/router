import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Generator, getConfig } from '../src'
import { routeIdOf } from './route-id'
import { routesOf } from './route-tree'

const rootRouteSource = `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`

const postsRouteSource = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  component: () => 'posts',
})
`

const savedPostsRouteSource = postsRouteSource.replace("'posts'", "'saved'")

let tempDir: string | undefined

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

/**
 * Reads a file and its modification time, like the generator's default
 * filesystem. With `coarse`, the time is rounded down to the second, like on
 * filesystems with a 1 s timestamp granularity.
 */
async function readFileWithStat(filePath: string, coarse = false) {
  try {
    const fileHandle = await fs.open(filePath, 'r')
    const stat = await fileHandle.stat({ bigint: true })
    const fileContent = (await fileHandle.readFile()).toString()
    await fileHandle.close()
    return {
      stat: { mtimeMs: coarse ? toSeconds(stat.mtimeMs) : stat.mtimeMs },
      fileContent,
    }
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      return 'file-not-existing' as const
    }
    throw e
  }
}

function toSeconds(mtimeMs: bigint) {
  return (mtimeMs / 1000n) * 1000n
}

/**
 * Creates an app in a temporary directory with a root route and
 * `routes/posts.tsx` holding `postsSource`; returns its paths and the
 * configuration of a generator for it.
 */
async function createApp(postsSource: string) {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-generator-race-'))
  const routesDirectory = path.join(tempDir, 'routes')
  const postsRoutePath = path.join(routesDirectory, 'posts.tsx')
  await fs.mkdir(routesDirectory)
  await fs.writeFile(path.join(routesDirectory, '__root.tsx'), rootRouteSource)
  await fs.writeFile(postsRoutePath, postsSource)
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

describe('generator with concurrent in-place saves', () => {
  it.each(['route file read', "generator's next file operation"] as const)(
    'does not scaffold over a route file whose in-place save completes during the %s',
    async (completeSaveDuring) => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-generator-race-'))
      const routesDirectory = path.join(tempDir, 'routes')
      const postsRoutePath = path.join(routesDirectory, 'posts.tsx')
      await fs.mkdir(routesDirectory)
      await fs.writeFile(
        path.join(routesDirectory, '__root.tsx'),
        rootRouteSource,
      )
      await fs.writeFile(postsRoutePath, postsRouteSource)

      let saveRacesNextRead = false
      let completeSave: (() => Promise<void>) | undefined
      /**
       * Completes a pending save before any file operation of the generator
       * after the racing read, whichever it is.
       */
      const settle = async () => {
        if (completeSave) {
          await completeSave()
        }
      }

      const generator = new Generator({
        config: getConfig(
          {
            disableLogging: true,
            routesDirectory,
            generatedRouteTree: path.join(tempDir, 'routeTree.gen.ts'),
            tmpDir: path.join(tempDir, 'tmp'),
          },
          tempDir,
        ),
        root: tempDir,
        fs: {
          rename: async (oldPath, newPath) => {
            await settle()
            return fs.rename(oldPath, newPath)
          },
          writeFile: async (filePath, content) => {
            await settle()
            return fs.writeFile(filePath, content)
          },
          readFile: async (filePath) => {
            await settle()
            // The generator passes route paths with forward slashes, also on
            // Windows.
            if (
              !saveRacesNextRead ||
              path.resolve(filePath) !== postsRoutePath
            ) {
              return readFileWithStat(filePath)
            }
            saveRacesNextRead = false

            // An editor saving in place truncates the file before writing the
            // new content, so the generator can observe an empty route file.
            await fs.truncate(postsRoutePath)
            const result = await readFileWithStat(postsRoutePath)
            if (result === 'file-not-existing') {
              throw new Error('expected the route file to exist')
            }

            // The save then completes within the same timestamp tick, which is
            // common for filesystems with coarse mtime granularity.
            completeSave = async () => {
              completeSave = undefined
              await fs.writeFile(postsRoutePath, savedPostsRouteSource)
              const truncatedAt = new Date(Number(result.stat.mtimeMs))
              await fs.utimes(postsRoutePath, truncatedAt, truncatedAt)
            }
            if (completeSaveDuring === 'route file read') {
              await completeSave()
            }

            return result
          },
          stat: async (filePath) => {
            await settle()
            const stat = await fs.stat(filePath, { bigint: true })
            return {
              mtimeMs: stat.mtimeMs,
              mode: Number(stat.mode),
              uid: Number(stat.uid),
              gid: Number(stat.gid),
            }
          },
          chmod: async (filePath, mode) => {
            await settle()
            return fs.chmod(filePath, mode)
          },
          chown: async (filePath, uid, gid) => {
            await settle()
            return fs.chown(filePath, uid, gid)
          },
        },
      })

      await generator.run()

      // A first save makes the generator process the route file again, and the
      // next save races with that read.
      await fs.writeFile(
        postsRoutePath,
        postsRouteSource.replace("'posts'", "'edited'"),
      )
      const editedAt = new Date(Date.now() + 10_000)
      await fs.utimes(postsRoutePath, editedAt, editedAt)
      saveRacesNextRead = true
      await generator.run({ type: 'update', path: postsRoutePath })
      await settle()

      await expect(fs.readFile(postsRoutePath, 'utf8')).resolves.toBe(
        savedPostsRouteSource,
      )
    },
  )
})

describe('a route file saved while the generator fixes it', () => {
  it('is processed before run() resolves', async () => {
    const { root, postsRoutePath, config } = await createApp(
      postsRouteSource.replace("'/posts'", "'/old'"),
    )
    let saved = false
    const generator = new Generator({
      config,
      root,
      fs: {
        rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
        writeFile: (filePath, content) => fs.writeFile(filePath, content),
        readFile: async (filePath) => {
          const result = await readFileWithStat(filePath)
          if (!saved && path.resolve(filePath) === postsRoutePath) {
            // The user saves the file right after the generator read it.
            saved = true
            await fs.writeFile(
              postsRoutePath,
              savedPostsRouteSource.replace("'/posts'", "'/wrong'"),
            )
            const savedAt = new Date(Date.now() + 10_000)
            await fs.utimes(postsRoutePath, savedAt, savedAt)
          }
          return result
        },
        stat: async (filePath) => {
          const stat = await fs.stat(filePath, { bigint: true })
          return {
            mtimeMs: stat.mtimeMs,
            mode: Number(stat.mode),
            uid: Number(stat.uid),
            gid: Number(stat.gid),
          }
        },
        chmod: (filePath, mode) => fs.chmod(filePath, mode),
        chown: (filePath, uid, gid) => fs.chown(filePath, uid, gid),
      },
    })

    await generator.run()

    expect(saved).toBe(true)
    await expect(fs.readFile(postsRoutePath, 'utf8')).resolves.toBe(
      savedPostsRouteSource,
    )
    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/posts': 'routes/posts.tsx',
    })
  })

  it('on a filesystem with 1 s timestamps, is not overwritten when the save completes during the read', async () => {
    const { root, postsRoutePath, config } = await createApp(postsRouteSource)
    let saveRacesNextRead = false
    const generator = new Generator({
      config,
      root,
      fs: {
        rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
        writeFile: (filePath, content) => fs.writeFile(filePath, content),
        readFile: async (filePath) => {
          if (!saveRacesNextRead || path.resolve(filePath) !== postsRoutePath) {
            return readFileWithStat(filePath, true)
          }
          saveRacesNextRead = false
          // An in-place save truncates the file, then writes the new content
          // within the same second.
          await fs.truncate(postsRoutePath)
          const result = await readFileWithStat(postsRoutePath, true)
          await fs.writeFile(postsRoutePath, savedPostsRouteSource)
          return result
        },
        stat: async (filePath) => {
          const stat = await fs.stat(filePath, { bigint: true })
          return {
            mtimeMs: toSeconds(stat.mtimeMs),
            mode: Number(stat.mode),
            uid: Number(stat.uid),
            gid: Number(stat.gid),
          }
        },
        chmod: (filePath, mode) => fs.chmod(filePath, mode),
        chown: (filePath, uid, gid) => fs.chown(filePath, uid, gid),
      },
    })
    await generator.run()

    await fs.writeFile(
      postsRoutePath,
      postsRouteSource.replace("'posts'", "'edited'"),
    )
    const editedAt = new Date(Date.now() + 10_000)
    await fs.utimes(postsRoutePath, editedAt, editedAt)
    saveRacesNextRead = true
    await generator.run({ type: 'update', path: postsRoutePath })

    expect(saveRacesNextRead).toBe(false)
    await expect(fs.readFile(postsRoutePath, 'utf8')).resolves.toBe(
      savedPostsRouteSource,
    )
  })
})

describe('route files the generator rewrites', () => {
  it.skipIf(process.platform === 'win32')('keep their file mode', async () => {
    const { root, postsRoutePath, config } = await createApp(
      postsRouteSource.replace("'/posts'", "'/old'"),
    )
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
      chown: async (filePath: string, uid: number, gid: number) => {
        if (chownError) {
          throw Object.assign(new Error(`chown ${chownError}`), {
            code: chownError,
          })
        }
        owners.set(key(filePath), { uid, gid })
      },
    }
  }

  it.each([
    { owner: { uid: 1001, gid: 1000 } },
    { owner: { uid: 1000, gid: 1001 } },
  ])('keep their owner $owner', async ({ owner }) => {
    const { root, postsRoutePath, config } = await createApp(
      postsRouteSource.replace("'/posts'", "'/old'"),
    )
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
    const { root, postsRoutePath, config } = await createApp(
      postsRouteSource.replace("'/posts'", "'/old'"),
    )
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
    const source = postsRouteSource.replace("'/posts'", "'/old'")
    const { root, postsRoutePath, config } = await createApp(source)
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
    await expect(fs.readFile(postsRoutePath, 'utf8')).resolves.toBe(source)
  })
})
