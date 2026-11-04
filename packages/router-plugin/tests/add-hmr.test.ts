import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'

import { compileCodeSplitReferenceRoute } from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { createRouteHmrStatement } from '../src/core/hmr'
import { frameworks } from './constants'
import { formatSnapshot } from './format-snapshot'

function getFrameworkDir(framework: string) {
  const files = path.resolve(__dirname, `./add-hmr/test-files/${framework}`)
  const snapshots = path.resolve(__dirname, `./add-hmr/snapshots/${framework}`)
  return { files, snapshots }
}

describe('add-hmr works', () => {
  describe.each(frameworks)('FRAMEWORK=%s', async (framework) => {
    const dirs = getFrameworkDir(framework)
    const filenames = await readdir(dirs.files)

    it.each(filenames)(
      `should add hmr in "reference" for "%s"`,
      async (filename) => {
        const file = await readFile(path.join(dirs.files, filename))
        const code = file.toString()

        const compileResult = compileCodeSplitReferenceRoute({
          code,
          filename,
          id: filename,
          addHmr: true,
          codeSplitGroupings: defaultCodeSplitGroupings,
          targetFramework: framework,
          compilerPlugins: getFrameworkHmrCompilerPlugins({
            targetFramework: framework,
          }),
        })

        await expect(
          await formatSnapshot(compileResult?.code || code, filename),
        ).toMatchFileSnapshot(
          path.join(dirs.snapshots, filename.replace('.tsx', '@true.tsx')),
        )
      },
    )

    it.each(filenames)(
      `should NOT add hmr in "reference" for "%s"`,
      async (filename) => {
        const file = await readFile(path.join(dirs.files, filename))
        const code = file.toString()

        const compileResult = compileCodeSplitReferenceRoute({
          code,
          filename,
          id: filename,
          addHmr: false,
          codeSplitGroupings: defaultCodeSplitGroupings,
          targetFramework: framework,
        })

        await expect(
          await formatSnapshot(compileResult?.code || code, filename),
        ).toMatchFileSnapshot(
          path.join(dirs.snapshots, filename.replace('.tsx', '@false.tsx')),
        )
      },
    )
  })

  it('supports configurable webpackHot HMR code generation', async () => {
    const filename = 'arrow-function.tsx'
    const framework = 'react'
    const file = await readFile(
      path.join(getFrameworkDir(framework).files, filename),
    )
    const code = file.toString()

    const compileResult = compileCodeSplitReferenceRoute({
      code,
      filename,
      id: filename,
      addHmr: true,
      hmrStyle: 'webpack',
      codeSplitGroupings: defaultCodeSplitGroupings,
      targetFramework: framework,
      compilerPlugins: getFrameworkHmrCompilerPlugins({
        targetFramework: framework,
        hmrStyle: 'webpack',
      }),
    })

    await expect(
      await formatSnapshot(compileResult?.code || code, filename),
    ).toMatchFileSnapshot(
      path.join(
        getFrameworkDir(framework).snapshots,
        filename.replace('.tsx', '@webpack-hot.tsx'),
      ),
    )
  })

  it('supports configurable webpackHot unsplittable HMR generation', async () => {
    const statement = createRouteHmrStatement([], {
      hmrStyle: 'webpack',
      targetFramework: 'react',
    })
    const output = JSON.stringify(statement)

    expect(output).toContain('webpackHot')
    expect(output).not.toContain('import.meta.hot')
    expect(output).toContain('oldHasShellComponent')
  })

  it('supports configurable Vite unsplittable HMR generation', async () => {
    const statement = createRouteHmrStatement([], {
      hmrStyle: 'vite',
      targetFramework: 'react',
    })
    const output = JSON.stringify(statement)

    expect(output).toContain('MetaProperty')
    expect(output).toContain('hot')
    expect(output).not.toContain('webpackHot')
    expect(output).toContain('newModule')
  })

  it('generates lazy reset and scoped route refresh without route context mutation', async () => {
    const filename = 'arrow-function.tsx'
    const framework = 'react'
    const file = await readFile(
      path.join(getFrameworkDir(framework).files, filename),
    )
    const code = file.toString()
    const compileResult = compileCodeSplitReferenceRoute({
      code,
      filename,
      id: filename,
      addHmr: true,
      codeSplitGroupings: defaultCodeSplitGroupings,
      targetFramework: framework,
      compilerPlugins: getFrameworkHmrCompilerPlugins({
        targetFramework: framework,
      }),
    })
    if (!compileResult) {
      throw new Error('Expected the reference route to be transformed')
    }
    const output = compileResult.code

    expect(output).toContain(
      'router._replaceRouteChunk(oldRoute, newRoute.lazyFn);',
    )
    expect(output).toContain('void router._refreshRoute?.();')
    expect(output).not.toContain('__routeContext')
  })

  it('uses a generated route id fallback for Vite HMR', async () => {
    const statement = createRouteHmrStatement([], {
      hmrStyle: 'vite',
      targetFramework: 'react',
      routeId: '/posts',
    })
    const output = JSON.stringify(statement)

    expect(output).toContain('tsr-route-id')
    expect(output).toContain('/posts')
  })

  it('prefers the current generated route id over stale Vite hot data', async () => {
    const statement = createRouteHmrStatement([], {
      hmrStyle: 'vite',
      targetFramework: 'react',
      routeId: '/current-route',
    })
    const output = JSON.stringify(statement)

    expect(output).toContain('"name":"initialRouteId"')
    expect(output).toContain(
      '"operator":"??","left":{"type":"StringLiteral","value":"/current-route"',
    )
    expect(output).toContain('"object":{"type":"Identifier","name":"hotData"}')
  })

  it('normalizes the generated root route id for Vite HMR', async () => {
    const statement = createRouteHmrStatement([], {
      hmrStyle: 'vite',
      targetFramework: 'react',
      routeId: '/__root',
    })
    const output = JSON.stringify(statement)

    expect(output).toContain('__root__')
    expect(output).not.toContain('/__root')
  })
})

/**
 * Starts a Vite dev server with the router plugin (and no framework plugin)
 * for an app made of `files`, connects an HMR client to it the way the
 * browser's `/@vite/client` does, and requests the app's modules from
 * `main.ts` on, as a page would.
 */
async function startDevApp(
  files: Record<string, string>,
  options: { autoCodeSplitting: boolean },
) {
  // Keep the app inside the package so runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.add-hmr-'))
  await mkdir(path.join(root, 'routes'))
  const allFiles: Record<string, string> = {
    'index.html': '<script type="module" src="/main.ts"></script>',
    'main.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const router = createRouter({ routeTree })
`,
    'routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
    ...files,
  }
  for (const [file, code] of Object.entries(allFiles)) {
    await writeFile(path.join(root, file), code)
  }
  const { tanstackRouter } = await import('../src/vite')
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0, strictPort: false },
    // A dependency optimisation would reload the page on its own.
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      tanstackRouter({
        target: 'react',
        routesDirectory: './routes',
        generatedRouteTree: './routeTree.gen.ts',
        autoCodeSplitting: options.autoCodeSplitting,
      }),
    ],
  })
  const close = async () => {
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
  try {
    await server.listen()
    const origin = server.resolvedUrls!.local[0]!.replace(/\/$/, '')
    const messages: Array<{ type: string }> = []
    const socket = new WebSocket(
      `${origin.replace('http', 'ws')}/?token=${server.config.webSocketToken}`,
      'vite-hmr',
    )
    socket.addEventListener('message', (event) => {
      messages.push(JSON.parse(String(event.data)))
    })
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve)
      socket.addEventListener('error', reject)
    })
    const statuses: Record<string, number> = {}
    const queue = ['/main.ts']
    while (queue.length > 0) {
      const url = queue.shift()!
      if (url in statuses) {
        continue
      }
      const response = await fetch(origin + url)
      statuses[url] = response.status
      const code = await response.text()
      // Static imports of the app's own modules
      for (const [, imported] of code.matchAll(
        /^import\s[^'"]*?["'](\/(?!@|node_modules)[^"'?]+)["']/gm,
      )) {
        queue.push(imported!)
      }
    }
    return {
      statuses,
      /** Writes `code` to `file`; resolves with Vite's first reaction. */
      async edit(file: string, code: string) {
        const seen = messages.length
        await writeFile(path.join(root, file), code)
        const deadline = Date.now() + 10_000
        while (Date.now() < deadline) {
          const reaction = messages
            .slice(seen)
            .find(
              (message) =>
                message.type === 'update' || message.type === 'full-reload',
            )
          if (reaction) {
            return reaction.type
          }
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        return 'nothing'
      },
      async close() {
        socket.close()
        await close()
      },
    }
  } catch (error) {
    await close()
    throw error
  }
}

describe('route HMR in a Vite dev server', () => {
  // Vite makes a module a hot boundary only when its code spells
  // `import.meta.hot.accept(` out. Route modules no framework plugin accepts
  // (a `.ts` route file, or an app without `@vitejs/plugin-react`) reloaded
  // the page on every edit.
  it.each([
    {
      name: 'a .ts route file',
      file: 'routes/index.ts',
      code: `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ loader: () => 'data v1' })
`,
      autoCodeSplitting: true,
    },
    {
      name: 'a route component, without a framework plugin',
      file: 'routes/index.tsx',
      code: `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>page v1</p> })
`,
      autoCodeSplitting: false,
    },
  ])(
    'an edit of $name is a hot update, not a page reload',
    async ({ file, code, autoCodeSplitting }) => {
      const app = await startDevApp({ [file]: code }, { autoCodeSplitting })
      try {
        expect(app.statuses[`/${file}`]).toBe(200)
        expect(await app.edit(file, code.replace('v1', 'v2'))).toBe('update')
      } finally {
        await app.close()
      }
    },
    30_000,
  )

  it('serves a route file with a binding named hot', async () => {
    const app = await startDevApp(
      {
        'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
const hot = 'hot'
export const Route = createFileRoute('/')({ component: () => <p>{hot}</p> })
`,
      },
      { autoCodeSplitting: true },
    )
    try {
      expect(app.statuses['/routes/index.tsx']).toBe(200)
    } finally {
      await app.close()
    }
  }, 30_000)
})
