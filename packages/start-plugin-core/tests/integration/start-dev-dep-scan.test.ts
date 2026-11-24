/**
 * Vite's upfront client dependency scan walks raw source imports before
 * Start's route-tree pruning and server-code stripping transforms run. A
 * package imported only by server handlers or `createServerFn` that declares
 * no browser export condition (e.g. `{ "exports": { "node": "./index.js" } }`)
 * must not fail the client dependency scan or skip upfront pre-bundling.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLogger, createServer } from 'vite'
import { expect, onTestFinished, test } from 'vitest'
import { appFiles, createStartApp } from './start-app'

const timeout = 60_000

const reactStartViteEntry = pathToFileURL(
  path.resolve(
    import.meta.dirname,
    '../../../react-start/dist/esm/plugin/vite.js',
  ),
).href

const nodeOnlyPkg = {
  'node_modules/node-only/package.json': JSON.stringify({
    name: 'node-only',
    type: 'module',
    exports: {
      '.': { node: './index.js' },
      './client': { node: './client.js' },
      './helper.server': { node: './client.js' },
    },
  }),
  'node_modules/node-only/index.js': `export const greeting = () => 'MARK_NODE_ONLY'\n`,
  'node_modules/node-only/client.js': `export const query = () => 'MARK_NODE_SUBPATH'\n`,
  'node_modules/client-dep/package.json': JSON.stringify({
    name: 'client-dep',
    main: './index.cjs',
    exports: {
      '.': './index.cjs',
    },
  }),
  'node_modules/client-dep/index.cjs': `module.exports = { label: 'MARK_CLIENT_DEP' }\n`,
  'node_modules/server-route-dep/package.json': JSON.stringify({
    name: 'server-route-dep',
    main: './index.cjs',
  }),
  'node_modules/server-route-dep/index.cjs': `exports.suffix = '!'\n`,
}

async function runClientDepScan(
  root: string,
  startOptions: Record<string, unknown> = {},
) {
  const { tanstackStart } = await import(reactStartViteEntry)
  const errors: Array<string> = []
  const customLogger = createLogger('error')
  customLogger.error = (msg) => errors.push(msg)

  const server = await createServer({
    root,
    configFile: false,
    customLogger,
    server: { port: 0 },
    plugins: [tanstackStart(startOptions)],
  })
  onTestFinished(() => server.close())
  await server.listen()
  await server.environments.client.depsOptimizer?.scanProcessing

  return {
    server,
    close: () => server.close(),
    errors,
    discovered: Object.keys(
      server.environments.client.depsOptimizer?.metadata.discovered ?? {},
    ),
  }
}

test(
  'client dep-scan succeeds when a server-only route imports a node-only package',
  async () => {
    const app = await createStartApp(
      appFiles({
        'package.json': JSON.stringify({
          name: 'app',
          type: 'module',
          dependencies: {
            'node-only': '*',
            'client-dep': '*',
            'server-route-dep': '*',
          },
        }),
        ...nodeOnlyPkg,
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { label } from 'client-dep'
export const Route = createFileRoute('/')({
  component: () => label,
})
`,
        'src/routes/api/hello.ts': `import { createFileRoute } from '@tanstack/react-router'
import { greeting } from 'node-only'
import serverRouteDep from 'server-route-dep'
export const Route = createFileRoute('/api/hello')({
  server: { handlers: { GET: () => new Response(greeting() + serverRouteDep.suffix) } },
})
`,
      }),
    )

    const { server, close, errors, discovered } = await runClientDepScan(
      app.root,
    )
    expect(errors).toEqual([])
    expect(discovered).toContain('client-dep')
    expect(discovered).not.toContain('node-only')
    expect(discovered).not.toContain('server-route-dep')

    const res = await fetch(`${server.resolvedUrls!.local[0]}api/hello`)
    expect(await res.text()).toBe('MARK_NODE_ONLY!')
    await close()
  },
  timeout,
)

test(
  'client dep-scan succeeds when createServerFn imports a node-only package with or without importProtection',
  async () => {
    for (const startOptions of [{}, { importProtection: { enabled: false } }]) {
      const app = await createStartApp(
        appFiles({
          'package.json': JSON.stringify({
            name: 'app',
            type: 'module',
            dependencies: { 'node-only': '*', 'client-dep': '*' },
          }),
          ...nodeOnlyPkg,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { query } from 'node-only/helper.server'
import { label } from 'client-dep'

const loadData = createServerFn().handler(async () => query())

export const Route = createFileRoute('/')({
  loader: () => loadData(),
  component: () => \`\${label}:\${Route.useLoaderData()}\`,
})
`,
        }),
      )

      const { close, errors, discovered } = await runClientDepScan(
        app.root,
        startOptions,
      )
      expect(errors).toEqual([])
      expect(discovered).toContain('client-dep')
      expect(discovered).not.toContain('node-only/helper.server')
      await close()
    }
  },
  timeout,
)

test(
  'client dep-scan still reports genuinely missing packages and unexported subpaths',
  async () => {
    const missingPkgApp = await createStartApp(
      appFiles({
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { nope } from 'definitely-not-installed-pkg'
export const Route = createFileRoute('/')({
  component: () => String(nope),
})
`,
      }),
    )

    const missingPkgScan = await runClientDepScan(missingPkgApp.root)
    expect(
      missingPkgScan.errors.some(
        (msg) =>
          msg.includes('Failed to run dependency scan') &&
          msg.includes('definitely-not-installed-pkg'),
      ),
    ).toBe(true)
    await missingPkgScan.close()

    const badSubpathApp = await createStartApp(
      appFiles({
        'package.json': JSON.stringify({
          name: 'app',
          type: 'module',
          dependencies: { 'node-only': '*' },
        }),
        ...nodeOnlyPkg,
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { nope } from 'node-only/non-existent'
export const Route = createFileRoute('/')({
  component: () => String(nope),
})
`,
      }),
    )

    const badSubpathScan = await runClientDepScan(badSubpathApp.root)
    expect(
      badSubpathScan.errors.some(
        (msg) =>
          msg.includes('Failed to run dependency scan') &&
          msg.includes('non-existent'),
      ),
    ).toBe(true)
    await badSubpathScan.close()
  },
  timeout,
)

test(
  'real client imports of a node-only package still fail outside dep-scan',
  async () => {
    const app = await createStartApp(
      appFiles({
        'package.json': JSON.stringify({
          name: 'app',
          type: 'module',
          dependencies: { 'node-only': '*', 'client-dep': '*' },
        }),
        ...nodeOnlyPkg,
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { greeting } from 'node-only'
import { label } from 'client-dep'
export const Route = createFileRoute('/')({
  component: () => \`\${label}:\${greeting()}\`,
})
`,
      }),
    )

    const { server, close, errors, discovered } = await runClientDepScan(
      app.root,
    )
    expect(errors).toEqual([])
    expect(discovered).toContain('client-dep')

    await expect(
      server.environments.client.transformRequest(
        '/src/routes/index.tsx?tsr-split=component',
      ),
    ).rejects.toThrow(/not exported under the conditions/)
    await close()
  },
  timeout,
)

test(
  'non-scan external resolutions to repository .server files still trigger import protection',
  async () => {
    const app = await createStartApp(
      appFiles({
        'src/secret.server.ts': `export const secret = 'TOP_SECRET'\n`,
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '#external-secret'
export const Route = createFileRoute('/')({
  component: () => secret,
})
`,
      }),
    )

    const { tanstackStart } = await import(reactStartViteEntry)
    const server = await createServer({
      root: app.root,
      configFile: false,
      logLevel: 'error',
      server: { middlewareMode: true },
      plugins: [
        tanstackStart({ importProtection: { behavior: 'error' } }),
        {
          name: 'test:external-local-server-file',
          resolveId(source) {
            if (source === '#external-secret') {
              return {
                id: path.join(app.root, 'src/secret.server.ts'),
                external: true,
              }
            }
            return undefined
          },
        },
      ],
    })
    onTestFinished(() => server.close())

    await expect(
      server.environments.client.transformRequest(
        '/src/routes/index.tsx?tsr-split=component',
      ),
    ).rejects.toThrow(/secret\.server\.ts/)
    await server.close()
  },
  timeout,
)
