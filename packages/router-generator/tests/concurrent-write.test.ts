import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { Generator, getConfig } from '../src'

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

async function readFileWithStat(filePath: string) {
  try {
    const fileHandle = await fs.open(filePath, 'r')
    const stat = await fileHandle.stat({ bigint: true })
    const fileContent = (await fileHandle.readFile()).toString()
    await fileHandle.close()
    return { stat, fileContent }
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      return 'file-not-existing' as const
    }
    throw e
  }
}

describe('generator with concurrent in-place saves', () => {
  it.each(['route file read', 'temporary file stat'] as const)(
    'does not scaffold over a route file whose in-place save completes during the %s',
    async (completeSaveDuring) => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-generator-race-'))
      const routesDirectory = path.join(tempDir, 'routes')
      const tmpDir = path.join(tempDir, 'tmp')
      const postsRoutePath = path.join(routesDirectory, 'posts.tsx')
      await fs.mkdir(routesDirectory)
      await fs.writeFile(
        path.join(routesDirectory, '__root.tsx'),
        rootRouteSource,
      )
      await fs.writeFile(postsRoutePath, postsRouteSource)

      let saveRacesNextRead = false
      let completeSave: (() => Promise<void>) | undefined

      const generator = new Generator({
        config: getConfig(
          {
            disableLogging: true,
            routesDirectory,
            generatedRouteTree: path.join(tempDir, 'routeTree.gen.ts'),
            tmpDir,
          },
          tempDir,
        ),
        root: tempDir,
        fs: {
          rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
          writeFile: (filePath, content) => fs.writeFile(filePath, content),
          readFile: async (filePath) => {
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
            if (completeSave && path.resolve(filePath).startsWith(tmpDir)) {
              await completeSave()
            }
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

      expect(saveRacesNextRead).toBe(false)
      expect(completeSave).toBeUndefined()
      await expect(fs.readFile(postsRoutePath, 'utf8')).resolves.toBe(
        savedPostsRouteSource,
      )
    },
  )
})
