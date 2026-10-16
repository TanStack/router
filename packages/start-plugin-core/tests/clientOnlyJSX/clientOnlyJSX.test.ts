import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  detectKindsInCode,
  StartCompiler,
} from '../../src/start-compiler/compiler'
import { formatSnapshot } from '../format-snapshot'
import {
  compileCode,
  evaluateModule,
  importSources,
} from '../regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'

// Default test options for StartCompiler
function getDefaultTestOptions(env: 'client' | 'server') {
  const envName = env === 'client' ? 'client' : 'ssr'
  return {
    envName,
    root: '/test',
    framework: 'react' as const,
    providerEnvName: 'ssr',
  }
}

async function compile(opts: {
  env: 'client' | 'server'
  code: string
  id: string
}) {
  const compiler = new StartCompiler({
    ...opts,
    ...getDefaultTestOptions(opts.env),
    loadModule: async () => {
      // do nothing in test
    },
    lookupKinds: new Set(['ClientOnlyJSX']),
    lookupConfigurations: [
      // ClientOnly JSX component from TanStack router packages
      {
        libName: '@tanstack/react-router',
        rootExport: 'ClientOnly',
        kind: 'ClientOnlyJSX',
      },
    ],
    getKnownServerFns: () => ({}),
    resolveId: async (id) => {
      return id
    },
  })
  const result = await compiler.compile({
    code: opts.code,
    id: opts.id,
  })
  return result
}

async function getFilenames() {
  return await readdir(path.resolve(import.meta.dirname, './test-files'))
}

describe('ClientOnlyJSX compiles correctly', async () => {
  const filenames = await getFilenames()

  describe.each(filenames)('should handle "%s"', async (filename) => {
    const file = await readFile(
      path.resolve(import.meta.dirname, `./test-files/${filename}`),
    )
    const code = file.toString()

    // ClientOnlyJSX is only transformed on server
    test(`should compile for ${filename} server`, async () => {
      const compiledResult = await compile({
        env: 'server',
        code,
        id: filename,
      })

      if (compiledResult) {
        await expect(
          await formatSnapshot(compiledResult.code, filename),
        ).toMatchFileSnapshot(`./snapshots/server/${filename}`)
      } else {
        // No transformation - for files where ClientOnly is not from TanStack
        await expect('no-transform').toMatchFileSnapshot(
          `./snapshots/server/${filename}`,
        )
      }
    })
  })

  test('ClientOnlyJSX should not be detected on client', () => {
    const code = `
      import { ClientOnly } from '@tanstack/react-router'
      <ClientOnly>test</ClientOnly>
    `
    const detectedKinds = detectKindsInCode(code, 'client')
    expect(detectedKinds.has('ClientOnlyJSX')).toBe(false)
  })

  test('ClientOnlyJSX should be detected on server', () => {
    const code = `
      import { ClientOnly } from '@tanstack/react-router'
      <ClientOnly>test</ClientOnly>
    `
    const detectedKinds = detectKindsInCode(code, 'server')
    expect(detectedKinds.has('ClientOnlyJSX')).toBe(true)
  })
})

// On the server, `<ClientOnly>` (of a TanStack router package) renders its
// fallback: its children, and the modules only they import, are gone from
// the SSR output. The client keeps them. Other components named ClientOnly
// are left alone.
// Replaces the snapshot fixtures of this directory (N4).
describe('<ClientOnly> children', () => {
  const libraries = {
    'heavy-chart-library': { Chart: () => '<chart>' },
    './utils': { formatData: () => 'data' },
    'video-player-lib': { VideoPlayer: () => '<video>' },
    'audio-viz-lib': { AudioVisualizer: () => '<audio>' },
    'animation-library': { HeavyAnimation: () => '<animation>' },
    './WindowSize': { WindowSize: () => '<size>' },
    'some-other-package': {
      ClientOnly: (props: { children?: string }) => props.children ?? '',
    },
  }
  /** `ClientOnly` renders its fallback on the server, its children on the client. */
  const router = (env: 'client' | 'server') => ({
    '@tanstack/react-router': {
      ClientOnly: (props: { children?: string; fallback?: string }) =>
        (env === 'server' ? props.fallback : props.children) ?? '',
      Link: (props: { children?: string }) => `<a>${props.children}</a>`,
    },
  })

  test.each([
    {
      // Source: snapshot fixture clientOnlyBasic.tsx
      name: 'a fallback',
      code: `import { ClientOnly } from '@tanstack/react-router'
import { Chart } from 'heavy-chart-library'
import { formatData } from './utils'
export function MyComponent() {
  return (
    <div>
      <ClientOnly fallback={<div>Loading...</div>}>
        <Chart data={formatData()} />
      </ClientOnly>
    </div>
  )
}`,
      childModules: ['./utils', 'heavy-chart-library'],
      ssr: '<div><div>Loading...</div></div>',
      client: '<div><chart></div>',
    },
    {
      // Source: snapshot fixture clientOnlyMultiple.tsx
      name: 'two boundaries',
      code: `import { ClientOnly } from '@tanstack/react-router'
import { VideoPlayer } from 'video-player-lib'
import { AudioVisualizer } from 'audio-viz-lib'
export function MyComponent() {
  return (
    <div>
      <ClientOnly fallback={<span>Loading video...</span>}>
        <VideoPlayer src="/video.mp4" />
      </ClientOnly>
      <p>Some server content</p>
      <ClientOnly fallback={<span>Loading audio...</span>}>
        <AudioVisualizer frequency={440} />
      </ClientOnly>
    </div>
  )
}`,
      childModules: ['audio-viz-lib', 'video-player-lib'],
      ssr: '<div><span>Loading video...</span><p>Some server content</p><span>Loading audio...</span></div>',
      client: '<div><video><p>Some server content</p><audio></div>',
    },
    {
      // Source: snapshot fixture clientOnlyNested.tsx
      name: 'a nested boundary',
      code: `import { ClientOnly } from '@tanstack/react-router'
export function MyComponent() {
  return (
    <div>
      <ClientOnly fallback={<div>Outer loading</div>}>
        <div>
          Outer content
          <ClientOnly fallback={<span>Inner loading</span>}>
            <span>Inner client only</span>
          </ClientOnly>
        </div>
      </ClientOnly>
    </div>
  )
}`,
      childModules: [],
      ssr: '<div><div>Outer loading</div></div>',
      client:
        '<div><div>Outer content<span>Inner client only</span></div></div>',
    },
    {
      // Source: snapshot fixture clientOnlyNoFallback.tsx
      name: 'no fallback',
      code: `import { ClientOnly } from '@tanstack/react-router'
import { HeavyAnimation } from 'animation-library'
export function MyComponent() {
  return (
    <div>
      <ClientOnly>
        <HeavyAnimation type="fade" />
      </ClientOnly>
    </div>
  )
}`,
      childModules: ['animation-library'],
      ssr: '<div></div>',
      client: '<div><animation></div>',
    },
    {
      // Source: snapshot fixture clientOnlyRenamed.tsx
      name: 'a renamed import',
      code: `import { ClientOnly as CO } from '@tanstack/react-router'
import { WindowSize } from './WindowSize'
export function MyComponent() {
  return (
    <div>
      <CO fallback={<div>Loading...</div>}>
        <WindowSize />
      </CO>
    </div>
  )
}`,
      childModules: ['./WindowSize'],
      ssr: '<div><div>Loading...</div></div>',
      client: '<div><size></div>',
    },
  ])(
    'a boundary with $name renders its fallback on the server and its children on the client',
    async ({ code, childModules, ssr, client }) => {
      const server = (await compileCode('ssr', code)) ?? code
      expect(await getModuleErrors(server)).toEqual([])
      for (const childModule of childModules) {
        expect(importSources(server)).not.toContain(childModule)
      }
      const { MyComponent: ServerComponent } = await evaluateModule(server, {
        ...libraries,
        ...router('server'),
      })
      expect(ServerComponent()).toBe(ssr)

      const browser = (await compileCode('client', code)) ?? code
      expect(importSources(browser)).toEqual(
        expect.arrayContaining(childModules),
      )
      const { MyComponent: ClientComponent } = await evaluateModule(browser, {
        ...libraries,
        ...router('client'),
      })
      expect(ClientComponent()).toBe(client)
    },
  )

  test.each([
    {
      // Source: snapshot fixture clientOnlyNotFromTanstack.tsx
      name: 'a ClientOnly of another package',
      code: `import { ClientOnly } from 'some-other-package'
export function MyComponent() {
  return (
    <div>
      <ClientOnly fallback={<div>Loading...</div>}>
        <div>This should remain as-is</div>
      </ClientOnly>
    </div>
  )
}`,
      html: '<div><div>This should remain as-is</div></div>',
    },
    {
      // Source: snapshot fixture clientOnlyWrongImportName.tsx
      name: 'another router component imported as ClientOnly',
      code: `import { Link as ClientOnly } from '@tanstack/react-router'
export function MyComponent() {
  return (
    <div>
      <ClientOnly to="/about">Go to About</ClientOnly>
    </div>
  )
}`,
      html: '<div><a>Go to About</a></div>',
    },
  ])('the server renders the children of $name', async ({ code, html }) => {
    const server = (await compileCode('ssr', code)) ?? code
    const { MyComponent } = await evaluateModule(server, {
      ...libraries,
      ...router('server'),
    })
    expect(MyComponent()).toBe(html)
  })
})
