import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createReadOnlyFs } from '../src/core/router-generator-plugin'
import { unpluginRouterComposedFactory } from '../src/core/router-composed-plugin'
import type { UnpluginOptions } from 'unplugin'

const rootRoute = `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`
const indexRoute = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => <div>index</div>,
})
`
const routeTree = '// existing route tree, must not be rewritten\n'

let root: string

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function setup() {
  root = mkdtempSync(path.join(tmpdir(), 'tsr-gen-disabled-'))
  mkdirSync(path.join(root, 'src/routes'), { recursive: true })
  writeFileSync(path.join(root, 'src/routes/__root.tsx'), rootRoute)
  writeFileSync(path.join(root, 'src/routes/index.tsx'), indexRoute)
  writeFileSync(path.join(root, 'src/routeTree.gen.ts'), routeTree)
}

async function runBuild(
  enableRouteGeneration: boolean,
  extra: Record<string, unknown> = {},
) {
  const plugins = unpluginRouterComposedFactory(
    {
      target: 'react',
      autoCodeSplitting: true,
      enableRouteGeneration,
      routesDirectory: path.join(root, 'src/routes'),
      generatedRouteTree: path.join(root, 'src/routeTree.gen.ts'),
      disableLogging: true,
      codeSplittingOptions: { addHmr: false },
      ...extra,
    },
    { framework: 'vite', versions: {} },
  ) as Array<UnpluginOptions>

  const config = {
    root,
    command: 'build',
    plugins: plugins.map((p) => ({ name: p.name })),
  } as never
  for (const plugin of plugins) {
    const hook = plugin.vite?.configResolved
    if (typeof hook === 'function') {
      await hook.call({} as never, config)
    } else if (hook) {
      await hook.handler.call({} as never, config)
    }
  }

  const reference = plugins.find(
    (p) => p.name === 'tanstack-router:code-splitter:compile-reference-file',
  )!
  const transform = reference.transform as {
    handler: (code: string, id: string) => any
  }
  const result = await transform.handler.call(
    {} as never,
    indexRoute,
    path.join(root, 'src/routes/index.tsx'),
  )
  return typeof result === 'string' ? result : result?.code
}

describe('autoCodeSplitting with enableRouteGeneration disabled', () => {
  it('splits routes and does not write the route tree', async () => {
    setup()
    const code = await runBuild(false)
    expect(code).toContain('lazyRouteComponent')
    expect(code).toContain('tsr-split=component')
    expect(readFileSync(path.join(root, 'src/routeTree.gen.ts'), 'utf8')).toBe(
      routeTree,
    )
    expect(readFileSync(path.join(root, 'src/routes/index.tsx'), 'utf8')).toBe(
      indexRoute,
    )
  })

  it('still generates the route tree when enabled', async () => {
    setup()
    const code = await runBuild(true)
    expect(code).toContain('lazyRouteComponent')
    expect(
      readFileSync(path.join(root, 'src/routeTree.gen.ts'), 'utf8'),
    ).not.toBe(routeTree)
  })

  it('does not create the temp or route tree directories on disk', async () => {
    setup()
    rmSync(path.join(root, 'src/routeTree.gen.ts'))
    const tmpDir = path.join(root, 'missing-tmp/nested')
    const treeDir = path.join(root, 'missing-gen')
    const code = await runBuild(false, {
      tmpDir,
      generatedRouteTree: path.join(treeDir, 'routeTree.gen.ts'),
    })
    expect(code).toContain('tsr-split=component')
    expect(existsSync(tmpDir)).toBe(false)
    expect(existsSync(path.join(root, 'missing-tmp'))).toBe(false)
    expect(existsSync(treeDir)).toBe(false)
  })

  it('lets edits on disk win over in-memory writes', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'tsr-gen-disabled-'))
    const file = path.join(root, 'route.tsx')
    writeFileSync(file, 'one')
    const fs = createReadOnlyFs()
    await fs.writeFile(file, 'virtual')
    expect(await fs.readFile(file)).toMatchObject({ fileContent: 'virtual' })

    writeFileSync(file, 'two')
    fs.invalidate(file)
    const res = await fs.readFile(file)
    expect(res).toMatchObject({ fileContent: 'two' })
    expect((await fs.stat(file)).mtimeMs).toBe(
      (res as { stat: { mtimeMs: bigint } }).stat.mtimeMs,
    )
    expect(readFileSync(file, 'utf8')).toBe('two')
  })
})
