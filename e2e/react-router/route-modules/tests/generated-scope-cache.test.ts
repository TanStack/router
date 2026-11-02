import { execFileSync } from 'node:child_process'
import { symlinkSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { expect, test } from 'vitest'
import { build } from 'vite'
import { Workspace } from './workspace'

test('a generated package named constructor gets a working scoped router', async () => {
  const ws = new Workspace(['settings', 'web'])
  try {
    // A valid unscoped package name must work even when it is also a property
    // of Object.prototype. Generate the provider and host exactly as packages do.
    ws.edit('settings', 'package.json', (source) => {
      const pkg = JSON.parse(source)
      pkg.name = 'constructor'
      return JSON.stringify(pkg)
    })
    ws.remove('settings', 'src')
    ws.write(
      'settings',
      'src/routes/__root.tsx',
      `import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})
`,
    )
    ws.write(
      'settings',
      'src/routes/profile.tsx',
      `import { createFileRoute } from '../routeScope.gen'
export const Route = createFileRoute('constructor:/profile')({})
`,
    )

    ws.edit('web', 'package.json', (source) => {
      const pkg = JSON.parse(source)
      for (const dependency of Object.keys(pkg.dependencies)) {
        if (dependency.startsWith('@route-modules/')) {
          delete pkg.dependencies[dependency]
        }
      }
      pkg.dependencies.constructor = 'workspace:*'
      return JSON.stringify(pkg)
    })
    symlinkSync(
      ws.pkg('settings'),
      ws.file('web', 'node_modules/constructor'),
      'dir',
    )
    ws.remove('web', 'src')
    ws.write(
      'web',
      'tsr.config.json',
      JSON.stringify({
        routeModules: {
          includes: [{ module: 'constructor', at: '/settings' }],
        },
      }),
    )
    ws.write(
      'web',
      'src/routes/__root.tsx',
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
    )
    ws.write(
      'web',
      'src/probe.tsx',
      `import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { RouterContextProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { useRouter } from 'constructor/scope'
import { routeTree } from './routeTree.gen'

export async function render() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/profile'] }),
    isServer: true,
  })
  await router.load()
  function Observer() {
    return <span>{useRouter().buildLocation({ to: '/profile' }).href}</span>
  }
  return renderToString(<RouterContextProvider router={router}><Observer /></RouterContextProvider>)
}
`,
    )
    await ws.buildGraph(['settings', 'web'], ['settings'])
    await build({
      root: ws.pkg('web'),
      configFile: false,
      logLevel: 'silent',
      ssr: { noExternal: ['constructor'] },
      build: {
        ssr: ws.file('web', 'src/probe.tsx'),
        outDir: ws.file('web', 'dist'),
        rolldownOptions: { output: { entryFileNames: 'probe.mjs' } },
      },
    })
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { render } from ${JSON.stringify(pathToFileURL(ws.file('web', 'dist/probe.mjs')).href)}; console.log(JSON.stringify(await render()));`,
      ],
      { cwd: ws.pkg('web'), encoding: 'utf8' },
    )
    expect(JSON.parse(output)).toBe('<span>/settings/profile</span>')
  } finally {
    ws.dispose()
  }
})
