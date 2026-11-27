import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Generator, getConfig } from '../src'

const rootRouteFile = `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`
const pingRouteFile = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/api/ping')({})
`

let dir: string

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// Creating symlinks needs a privilege on Windows that CI runners lack.
describe.skipIf(process.platform === 'win32')(
  'route files reached through symlinks',
  () => {
    it('keys getRoutesByFileMap under the scanned path and its real path', async () => {
      dir = mkdtempSync(join(tmpdir(), 'tsr-symlinked-routes-'))
      const real = join(dir, 'real')
      const app = join(dir, 'app')
      const routes = join(app, 'routes')
      mkdirSync(real, { recursive: true })
      mkdirSync(routes, { recursive: true })
      writeFileSync(join(routes, '__root.tsx'), rootRouteFile)
      writeFileSync(join(real, 'api.ping.ts'), pingRouteFile)
      symlinkSync(join(real, 'api.ping.ts'), join(routes, 'api.ping.ts'))

      const config = getConfig({
        disableLogging: true,
        routesDirectory: routes,
        generatedRouteTree: join(app, 'routeTree.gen.ts'),
      })
      const generator = new Generator({ config, root: app })
      await generator.run()

      const routesByFile = generator.getRoutesByFileMap()
      const pingKeys = [...routesByFile.keys()].filter((key) =>
        key.endsWith('api.ping.ts'),
      )
      const realPath = realpathSync(join(real, 'api.ping.ts'))
      // The scanned (link) path, as before...
      expect(pingKeys.some((key) => key.endsWith('/routes/api.ping.ts'))).toBe(
        true,
      )
      // ...and the real path a symlink-resolving bundler hands its transforms.
      expect(routesByFile.get(realPath.replace(/\\/g, '/'))).toEqual({
        routeId: '/api/ping',
      })
      for (const key of pingKeys) {
        expect(routesByFile.get(key)).toEqual({ routeId: '/api/ping' })
      }
    })

    it('never lets a real-path alias replace a scanned route, and skips an ambiguous one', async () => {
      dir = mkdtempSync(join(tmpdir(), 'tsr-symlinked-routes-'))
      const real = join(dir, 'real')
      const app = join(dir, 'app')
      const routes = join(app, 'routes')
      mkdirSync(real, { recursive: true })
      mkdirSync(routes, { recursive: true })
      writeFileSync(join(routes, '__root.tsx'), rootRouteFile)
      // A scanned route file, and a symlink to it under another route name:
      // the scanned entry keeps its own id.
      writeFileSync(join(routes, 'api.ping.ts'), pingRouteFile)
      symlinkSync(join(routes, 'api.ping.ts'), join(routes, 'api.pong.ts'))
      // Two symlinked routes sharing one real file outside the routes dir:
      // that real path names no single route, so it gets no alias.
      writeFileSync(join(real, 'shared.ts'), pingRouteFile)
      symlinkSync(join(real, 'shared.ts'), join(routes, 'api.left.ts'))
      symlinkSync(join(real, 'shared.ts'), join(routes, 'api.right.ts'))

      const config = getConfig({
        disableLogging: true,
        routesDirectory: routes,
        generatedRouteTree: join(app, 'routeTree.gen.ts'),
      })
      const generator = new Generator({ config, root: app })
      await generator.run()

      const routesByFile = generator.getRoutesByFileMap()
      const byName = (name: string) =>
        [...routesByFile.entries()].find(([key]) =>
          key.endsWith(`/routes/${name}`),
        )?.[1]
      expect(byName('api.ping.ts')).toEqual({ routeId: '/api/ping' })
      expect(byName('api.pong.ts')).toEqual({ routeId: '/api/pong' })
      expect(byName('api.left.ts')).toEqual({ routeId: '/api/left' })
      expect(byName('api.right.ts')).toEqual({ routeId: '/api/right' })
      const sharedRealPath = realpathSync(join(real, 'shared.ts')).replace(
        /\\/g,
        '/',
      )
      expect(routesByFile.has(sharedRealPath)).toBe(false)
    })
  },
)
