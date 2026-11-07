/**
 * Windows paths on webpack: an output of a route file imports another
 * output of that file by the file's absolute path with forward slashes
 * (`C:/…/posts.tsx?tsr-split=…`, how the hosts normalise ids), and the route
 * module's own path from a chunk (`C:/…/posts.tsx`). webpack's resolver
 * (enhanced-resolve, whose path handling is the same string logic on every
 * platform) must give each the resource of the file as the app's own
 * relative import reaches it (`C:\…\posts.tsx`): one module per file and
 * query. Run on a file system of Windows paths, so that every platform's
 * unit tier checks it; Rspack's resolver (native) is checked by the
 * integration smoke set on the Windows CI job (`split-module-ids.test.ts`).
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  deriveId,
  identify,
  sameFileSpecifier,
  webpackResourceId,
} from '@tanstack/router-utils/compiler'

const require = createRequire(import.meta.url)
const enhancedResolve = createRequire(require.resolve('webpack'))(
  'enhanced-resolve',
) as {
  ResolverFactory: {
    createResolver: (options: Record<string, unknown>) => {
      resolve: (
        context: object,
        dir: string,
        request: string,
        resolveContext: object,
        callback: (error: Error | null, result?: string | false) => void,
      ) => void
    }
  }
}

/** A read-only file system holding `files` (Windows paths), as webpack's input file system. */
function windowsFileSystem(files: Array<string>) {
  const dirs = new Set<string>()
  for (const file of files) {
    let dir = path.win32.dirname(file)
    while (!dirs.has(dir)) {
      dirs.add(dir)
      const parent = path.win32.dirname(dir)
      if (parent === dir) {
        break
      }
      dir = parent
    }
  }
  const missing = (p: string) =>
    Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' })
  const stat = (p: string, cb: (e: Error | null, s?: object) => void) => {
    const file = files.includes(p)
    if (!file && !dirs.has(p)) {
      cb(missing(p))
      return
    }
    cb(null, { isFile: () => file, isDirectory: () => !file })
  }
  return {
    stat,
    lstat: stat,
    readdir: (p: string, cb: (e: Error | null, r?: Array<string>) => void) =>
      dirs.has(p)
        ? cb(
            null,
            files
              .filter((f) => path.win32.dirname(f) === p)
              .map((f) => path.win32.basename(f)),
          )
        : cb(missing(p)),
    readFile: (p: string, cb: (e: Error | null, r?: Buffer) => void) =>
      files.includes(p) ? cb(null, Buffer.from('')) : cb(missing(p)),
    readlink: (p: string, cb: (e: Error | null) => void) =>
      cb(Object.assign(new Error(`EINVAL: ${p}`), { code: 'EINVAL' })),
  }
}

describe.each([
  { name: 'a Windows path', root: 'C:\\Users\\me\\app' },
  { name: 'a Windows path with #', root: 'C:\\Users\\me\\C#\\project #2' },
])('$name', ({ root }) => {
  const route = path.win32.join(root, 'src', 'routes', 'posts.tsx')
  const resolver = enhancedResolve.ResolverFactory.createResolver({
    fileSystem: windowsFileSystem([route]),
    extensions: ['.tsx', '.ts'],
    symlinks: false,
  })
  const resolve = (dir: string, request: string) =>
    new Promise<string>((done, fail) =>
      resolver.resolve({}, dir, request, {}, (error, result) =>
        error || !result ? fail(error) : done(result),
      ),
    )

  it("resolves an output's import of another output of its file to one module of that file", async () => {
    // the route module, as the app's route tree imports it
    const resource = await resolve(
      path.win32.join(root, 'src'),
      './routes/posts',
    )
    const routeId = webpackResourceId(resource)
    expect(routeId).toBe(route.replace(/\\/g, '/'))

    const routesDir = path.win32.dirname(route)
    for (const derived of [
      { kind: 'split', value: 'component~loader' },
      { kind: 'shared', value: 'component+errorComponent' },
      { kind: 'export', value: 'Card' },
    ] as const) {
      const id = deriveId(routeId, derived)
      const resolved = await resolve(routesDir, sameFileSpecifier(id))
      // the same resource as the route module, with the output's query
      expect(resolved).toBe(resource + id.slice(id.indexOf('?')))
      expect(webpackResourceId(resolved)).toBe(id)
      expect(identify(webpackResourceId(resolved)).derived).toEqual(
        identify(id).derived,
      )
    }
    // a chunk importing a binding the route module keeps: the route module itself
    expect(await resolve(routesDir, sameFileSpecifier(routeId))).toBe(resource)
  })
})
