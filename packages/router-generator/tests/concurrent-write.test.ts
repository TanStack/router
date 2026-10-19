/**
 * Writes of the generator racing with the user's saves, and the atomic
 * publication of route files and the route tree (SPEC J1.6, J1.16): real
 * files, with the generator's `fs` option as the narrow boundary where a
 * save, a reader or a fault comes in.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'

import { Generator, getConfig } from '../src'
import { expectOnlyOwnedEdits } from './owned-edits'
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
    // The saved file, with its id fixed (the quotes of the id are free).
    const written = await fs.readFile(postsRoutePath, 'utf8')
    expectOnlyOwnedEdits(
      savedPostsRouteSource.replace("'/posts'", "'/wrong'"),
      written,
    )
    expect(await routeIdOf(written)).toBe('/posts')
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

// (The mode and owner of rewritten route files: outside the compiler test
// corpus, tests/outside-compiler-corpus/file-metadata.test.ts.)

/**
 * The real filesystem as the generator's `fs` option, with a reader of
 * `watched` files during each write and rename the generator makes: each
 * write is made in two halves, and between them, and before and after each
 * rename, the reader reads every watched file (`seen` records what it read,
 * by file; `null` for a missing file). `fault` may make an operation fail
 * instead (after the first half, for a write).
 */
function filesystemWithReader(
  watched: Array<string>,
  fault?: (
    operation: 'writeFile' | 'rename',
    paths: Array<string>,
  ) => NodeJS.ErrnoException | undefined,
) {
  const seen = new Map<string, Set<string | null>>(
    watched.map((file) => [file, new Set()]),
  )
  const readAll = async () => {
    for (const file of watched) {
      const content = await fs.readFile(file, 'utf8').catch(() => null)
      seen.get(file)!.add(content)
    }
  }
  return {
    seen,
    fs: {
      rename: async (oldPath: string, newPath: string) => {
        await readAll()
        const error = fault?.('rename', [oldPath, newPath])
        if (error) {
          throw error
        }
        await fs.rename(oldPath, newPath)
        await readAll()
      },
      writeFile: async (filePath: string, content: string) => {
        const half = Math.ceil(content.length / 2)
        await fs.writeFile(filePath, content.slice(0, half))
        await readAll()
        const error = fault?.('writeFile', [filePath])
        if (error) {
          throw error
        }
        await fs.appendFile(filePath, content.slice(half))
      },
      readFile: (filePath: string) => readFileWithStat(filePath),
      stat: async (filePath: string) => {
        const stat = await fs.stat(filePath, { bigint: true })
        return {
          mtimeMs: stat.mtimeMs,
          mode: Number(stat.mode),
          uid: Number(stat.uid),
          gid: Number(stat.gid),
        }
      },
      chmod: (filePath: string, mode: number) => fs.chmod(filePath, mode),
      chown: (filePath: string, uid: number, gid: number) =>
        fs.chown(filePath, uid, gid),
    },
  }
}

/**
 * An app whose next run rewrites both a route file (`routes/posts.tsx`, a
 * wrong id) and the route tree (a new route, `routes/about.tsx`): the tree
 * of a first run and the files before the next run.
 */
async function appBeforeRewrite(tmpDir?: string) {
  const { root, postsRoutePath, config } = await createApp(postsRouteSource)
  if (tmpDir) {
    config.tmpDir = tmpDir
  }
  await new Generator({ config, root }).run()
  await fs.writeFile(
    postsRoutePath,
    postsRouteSource.replace("'/posts'", "'/old'"),
  )
  await fs.writeFile(
    path.join(root, 'routes/about.tsx'),
    postsRouteSource.replace("'/posts'", "'/about'"),
  )
  const files = [postsRoutePath, config.generatedRouteTree]
  const before = await Promise.all(
    files.map((file) => fs.readFile(file, 'utf8')),
  )
  return { root, config, files, before }
}

// SPEC J1.6: a route file and the route tree are published atomically: a
// reader never sees a half-written file, also when a publication fails.
describe('publication of route files and the route tree', () => {
  it('a reader during the publications sees only the complete old or new contents', async () => {
    const { root, config, files, before } = await appBeforeRewrite()
    const { seen, fs: readerFs } = filesystemWithReader(files)
    await new Generator({ config, root, fs: readerFs }).run()

    const after = await Promise.all(
      files.map((file) => fs.readFile(file, 'utf8')),
    )
    expect(await routeIdOf(after[0]!)).toBe('/posts')
    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/about': 'routes/about.tsx',
      '/posts': 'routes/posts.tsx',
    })
    for (const [index, file] of files.entries()) {
      const contents = [...seen.get(file)!]
      expect(contents.length, file).toBeGreaterThan(0)
      for (const content of contents) {
        expect([before[index], after[index]], file).toContain(content)
      }
    }
  })

  it.each([
    {
      name: 'a write that fails half-way (disk full)',
      fault: (operation: string) =>
        operation === 'writeFile'
          ? Object.assign(new Error('ENOSPC: no space left on device'), {
              code: 'ENOSPC',
            })
          : undefined,
    },
    {
      name: 'a rename that fails',
      fault: (operation: string) =>
        operation === 'rename'
          ? Object.assign(new Error('EIO: i/o error, rename'), {
              code: 'EIO',
            })
          : undefined,
    },
  ])(
    'after $name, the route file and the route tree hold their complete old contents',
    async ({ fault }) => {
      const { root, config, files, before } = await appBeforeRewrite()
      const { seen, fs: faultyFs } = filesystemWithReader(files, fault)
      await new Generator({ config, root, fs: faultyFs }).run().catch(() => {})

      for (const [index, file] of files.entries()) {
        expect(await fs.readFile(file, 'utf8'), file).toBe(before[index])
        for (const content of seen.get(file)!) {
          expect(content, file).toBe(before[index])
        }
      }
    },
  )

  /**
   * A writable directory on another filesystem than `dir` (its device
   * differs), if the host has one: the system's temporary directory, shared
   * memory, or this package's directory.
   */
  async function directoryOnAnotherDevice(dir: string) {
    const { dev } = await fs.stat(dir)
    for (const candidate of [os.tmpdir(), '/dev/shm', process.cwd()]) {
      const stat = await fs.stat(candidate).catch(() => undefined)
      if (stat?.isDirectory() && stat.dev !== dev) {
        const tmpDir = await fs
          .mkdtemp(path.join(candidate, 'tsr-generator-tmp-'))
          .catch(() => undefined)
        if (tmpDir) {
          onTestFinished(() => fs.rm(tmpDir, { recursive: true, force: true }))
          return tmpDir
        }
      }
    }
    return undefined
  }

  // Bug (K-19): with `tmpDir` on another filesystem than the app (e.g. the
  // app on a disk and TSR_TMP_DIR on a tmpfs), every publication fails:
  // renaming the temporary file onto the route file or the route tree fails
  // with EXDEV, and the run fails. The atomic fallback is to write the
  // temporary file beside the destination and rename it there (DECISIONS
  // 2026-10-18 K-19; SPEC J1.16); a copy over the destination is not atomic
  // (the destination file must be replaced, not rewritten in place). On a
  // host with a single filesystem, a fault makes renames across
  // directories fail with EXDEV instead.
  // Source: src/generator.ts:1203-1290 (`safeFileWrite` renames from
  // `getTempFileName`'s file in `config.tmpDir`).
  // Impact: route generation fails until tmpDir is moved to the app's
  // filesystem (api/file-based-routing.md `tmpDir` names no such limit).
  it.fails(
    'with tmpDir on another filesystem, the route file and the route tree are replaced atomically',
    async () => {
      // (the apps of these tests are in the system's temporary directory)
      const otherDevice = await directoryOnAnotherDevice(os.tmpdir())
      const tmpDir =
        otherDevice ??
        (await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-generator-tmp-')))
      onTestFinished(() => fs.rm(tmpDir, { recursive: true, force: true }))
      const { root, config, files, before } = await appBeforeRewrite(tmpDir)
      const inodes = await Promise.all(
        files.map(async (file) => (await fs.stat(file)).ino),
      )
      const { seen, fs: readerFs } = filesystemWithReader(
        files,
        otherDevice
          ? undefined
          : (operation, [from, to]) =>
              operation === 'rename' &&
              path.dirname(from!) !== path.dirname(to!)
                ? Object.assign(
                    new Error('EXDEV: cross-device link not permitted'),
                    { code: 'EXDEV' },
                  )
                : undefined,
      )
      await new Generator({ config, root, fs: readerFs }).run()

      const after = await Promise.all(
        files.map((file) => fs.readFile(file, 'utf8')),
      )
      expect(await routeIdOf(after[0]!)).toBe('/posts')
      expect(await routesOf(config.generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
        '/about': 'routes/about.tsx',
        '/posts': 'routes/posts.tsx',
      })
      for (const [index, file] of files.entries()) {
        // (replaced by a rename, not rewritten in place or copied over)
        expect((await fs.stat(file)).ino, file).not.toBe(inodes[index])
        for (const content of seen.get(file)!) {
          expect([before[index], after[index]], file).toContain(content)
        }
      }
    },
  )
})
