/**
 * Not part of the compiler test corpus (filesystem policy): whether the
 * generator removes what it staged for a write it abandons. SPEC J1.6/J1.16
 * promise atomically published destinations, not a project free of other
 * files (a lock, cache or support file is fine), and no ruling adopts a
 * cleanup contract (V1R gen G06). The outcome the user sees (the save is
 * kept, the route tree is usable) is tested in concurrent-write.test.ts.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { Generator, getConfig } from '../../src'

/** The component of the route file the generator prepares its fix of. */
const fixedComponent = "component: () => 'posts'"

const oldRouteSource = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/old')({
  ${fixedComponent},
})
`

const savedRouteSource = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  component: () => 'saved',
})
`

let tempDir: string | undefined

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

/** The files under `dir` (relative, `/` separated) that contain `text`. */
async function filesContaining(dir: string, text: string) {
  const entries = await fs.readdir(dir, {
    recursive: true,
    withFileTypes: true,
  })
  const found: Array<string> = []
  for (const entry of entries) {
    const file = path.join(entry.parentPath, entry.name)
    if (entry.isFile() && (await fs.readFile(file, 'utf8')).includes(text)) {
      found.push(path.relative(dir, file).replaceAll(path.sep, '/'))
    }
  }
  return found
}

// Bug: when the user's save makes the generator's fix unnecessary (the
// saved file already has the right id), the generator abandons its write
// and never removes the temporary file it prepared for it.
// Source: src/generator.ts `safeFileWrite` (writes the temporary file,
// then throws `rerun` on the modification check without removing it; the
// rerun finds nothing to write).
// Impact: every such save leaves a copy of a route file in the app's
// `tmpDir` (by default `.tanstack/tmp` in the project), accumulating over
// a dev session.
it.fails(
  'leaves no staged copy of the abandoned fix when a save makes it unnecessary',
  async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-generator-race-'))
    const root = tempDir
    const routeFile = path.join(root, 'routes/posts.tsx')
    await fs.mkdir(path.join(root, 'routes'))
    await fs.writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`,
    )
    await fs.writeFile(routeFile, oldRouteSource)
    const config = getConfig(
      {
        disableLogging: true,
        routesDirectory: path.join(root, 'routes'),
        generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
        tmpDir: path.join(root, 'tmp'),
      },
      root,
    )
    let saved = false
    await new Generator({
      config,
      root,
      fs: {
        rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
        writeFile: (filePath, content) => fs.writeFile(filePath, content),
        readFile: async (filePath) => {
          const fileHandle = await fs.open(filePath, 'r').catch(() => null)
          if (!fileHandle) {
            return 'file-not-existing' as const
          }
          const stat = await fileHandle.stat({ bigint: true })
          const fileContent = (await fileHandle.readFile()).toString()
          await fileHandle.close()
          if (!saved && path.resolve(filePath) === routeFile) {
            // The user fixes the id and saves right after the generator
            // read the file.
            saved = true
            await fs.writeFile(routeFile, savedRouteSource)
            const savedAt = new Date(Date.now() + 10_000)
            await fs.utimes(routeFile, savedAt, savedAt)
          }
          return { stat: { mtimeMs: stat.mtimeMs }, fileContent }
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
    }).run()

    expect(saved).toBe(true)
    await expect(fs.readFile(routeFile, 'utf8')).resolves.toBe(savedRouteSource)
    // No file of the app, wherever the generator staged it, still holds the
    // fix it prepared (the component the save replaced)
    expect(await filesContaining(root, fixedComponent)).toEqual([])
  },
)
