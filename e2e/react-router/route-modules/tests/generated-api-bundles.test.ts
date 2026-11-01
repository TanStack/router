import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { afterEach, expect, test } from 'vitest'
import { Generator, getConfig } from '@tanstack/router-generator'
import { build } from 'vite'
import solid from 'vite-plugin-solid'

type Framework = 'react' | 'solid' | 'vue'
const repository = fileURLToPath(new URL('../../../../', import.meta.url))
const workspaces: Array<string> = []
const neutralEntry = `globalThis.__routeModuleBundleProbe = 'retained'`

afterEach(async () => {
  for (const workspace of workspaces.splice(0)) {
    await fs.rm(workspace, { recursive: true, force: true })
  }
})

async function write(file: string, source: string) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, source)
}

async function link(root: string, name: string, target: string) {
  const file = path.join(root, 'node_modules', name)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.symlink(target, file, 'dir')
}

async function fixtures(framework: Framework) {
  const workspace = realpathSync(
    await fs.mkdtemp(path.join(os.tmpdir(), 'route-module-bundles-')),
  )
  workspaces.push(workspace)
  // Third-party dependencies resolve exactly as in the installed workspace;
  // framework imports below still go through their published package exports.
  await fs.symlink(
    path.join(repository, 'node_modules'),
    path.join(workspace, 'node_modules'),
    'dir',
  )
  const routerPackage = `@tanstack/${framework}-router`
  const startPackage = `@tanstack/${framework}-start`
  const dependency = path.join(workspace, 'dependency')
  const provider = path.join(workspace, 'provider')
  const host = path.join(workspace, 'host')
  for (const [root, name, isModule] of [
    [dependency, '@bundle/dependency', true],
    [provider, '@bundle/provider', true],
    [host, '@bundle/host', false],
  ] as const) {
    await write(
      path.join(root, 'package.json'),
      JSON.stringify({
        name,
        type: 'module',
        dependencies: {
          [routerPackage]: '*',
          ...(root === provider
            ? { [startPackage]: '*', '@bundle/dependency': '*' }
            : {}),
          ...(root === host
            ? { '@bundle/provider': '*', '@bundle/dependency': '*' }
            : {}),
        },
        exports: {
          './route-module': './src/routeModule.gen.ts',
          './route-types': './src/routeContract.gen.ts',
        },
        ...(isModule
          ? {
              tanstack: {
                router: {
                  module:
                    root === provider ? { uses: ['@bundle/dependency'] } : true,
                },
              },
            }
          : {}),
      }),
    )
    await link(
      root,
      routerPackage,
      path.join(repository, 'packages', `${framework}-router`),
    )
    if (root === provider) {
      await link(
        root,
        startPackage,
        path.join(repository, 'packages', `${framework}-start`),
      )
    }
    await write(
      path.join(root, 'src/routes/__root.tsx'),
      isModule
        ? `import { createModuleRoot } from '../routeScope.gen'
${root === provider ? "export type {} from '../requirements'" : ''}
export const Route = createModuleRoot()({})`
        : `import { createRootRoute } from '${routerPackage}'
export const Route = createRootRoute()`,
    )
    if (isModule) {
      await write(
        path.join(root, 'src/routes/page.tsx'),
        `import { createFileRoute } from '../routeScope.gen'
export const Route = createFileRoute('${name}:/page')({})`,
      )
    }
  }
  await link(provider, '@bundle/dependency', dependency)
  await link(host, '@bundle/provider', provider)
  await link(host, '@bundle/dependency', dependency)
  await write(
    path.join(provider, 'src/requirements.ts'),
    `export type { StartModuleRequirements } from '${startPackage}'
declare module '${startPackage}' {
  interface StartModuleRequirements {
    '@bundle/provider': { requestContext: { requiredByBundleFixture: string } }
  }
}`,
  )
  for (const root of [dependency, provider, host]) {
    const config = getConfig(
      {
        target: framework,
        disableLogging: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
        ...(root === host
          ? {
              routeModules: {
                includes: [
                  { module: '@bundle/provider', at: '/provider' },
                  { module: '@bundle/dependency', at: '/dependency' },
                ],
              },
            }
          : {}),
      },
      root,
    )
    await new Generator({ root, config }).run()
  }
  return { workspace, provider, host, routerPackage, startPackage }
}

interface Bundle {
  source: string
  code: string
  moduleIds: Array<string>
  raw: number
  gzip: number
  brotli: number
}

async function bundle(
  framework: Framework,
  root: string,
  name: string,
  entry: string,
): Promise<Bundle> {
  const directory = path.join(root, 'bundle-cases', name)
  const input = path.join(directory, 'index.html')
  await write(path.join(directory, 'entry.ts'), entry)
  await write(
    input,
    '<!doctype html><html><body><script type="module" src="./entry.ts"></script></body></html>',
  )
  const output: Array<string> = []
  const moduleIds = new Set<string>()
  for (const minify of [false, true]) {
    const result = await build({
      root: directory,
      configFile: false,
      mode: 'production',
      plugins: framework === 'solid' ? [solid({ dev: false })] : [],
      resolve: {
        conditions: [
          ...(framework === 'solid' ? ['solid'] : []),
          'module',
          'browser',
          'production',
        ],
      },
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        write: false,
        minify,
        sourcemap: false,
        rolldownOptions: { input },
      },
    })
    if (!('output' in result)) {
      throw new Error('Expected a single application bundle')
    }
    for (const chunk of result.output) {
      if (chunk.type === 'chunk') {
        for (const id of Object.keys(chunk.modules)) {
          moduleIds.add(id.replaceAll('\\', '/'))
        }
      }
    }
    output.push(
      result.output
        .filter((file) => file.type === 'chunk')
        .map((file) => file.code)
        .join('\n'),
    )
  }
  const code = output[1]!
  return {
    source: output[0]!,
    code,
    moduleIds: [...moduleIds],
    raw: Buffer.byteLength(code),
    gzip: gzipSync(code).byteLength,
    brotli: brotliCompressSync(code).byteLength,
  }
}

const scopedApis = [
  'Link',
  'CreateLink',
  'LinkOptions',
  'Navigate',
  'UseNavigate',
  'Redirect',
  'MatchRoute',
  'UseMatchRoute',
  'UseRouter',
  'GetRouteApi',
  'UseMatch',
  'UseMatches',
  'UseParentMatches',
  'UseChildMatches',
  'UseLoaderData',
  'UseLoaderDeps',
  'UseSearch',
  'UseParams',
  'UseRouteContext',
  'UseLocation',
  'UseRouterState',
  'UseLinkProps',
  'UseBlocker',
  'NotFound',
]

function expectIndependentApi(result: Bundle, retained?: string) {
  for (const api of scopedApis) {
    if (api !== retained) {
      expect(result.source).not.toMatch(
        new RegExp(`\\bfunction\\s+bindRouteScope${api}\\b`),
      )
    }
  }
}

function sizes(bundle: Bundle) {
  return { raw: bundle.raw, gzip: bundle.gzip, brotli: bundle.brotli }
}

test.each(['react', 'solid', 'vue'] as const)(
  '%s generated APIs and static namespaces discard unused initializers',
  async (framework) => {
    const { provider, host, routerPackage, startPackage } =
      await fixtures(framework)
    const own = JSON.stringify(path.join(provider, 'src/routeScope.gen.ts'))
    const namespaces = JSON.stringify(path.join(host, 'src/routeScope.gen.ts'))
    const results: Record<string, ReturnType<typeof sizes>> = {}
    const measure = async (name: string, entry: string) => {
      const result = await bundle(framework, provider, name, entry)
      results[name] = sizes(result)
      return result
    }
    const neutral = await measure('neutral', neutralEntry)
    for (const [name, entry] of [
      ['unused-own-scope', `import ${own}; ${neutralEntry}`],
      ['unused-namespaces', `import ${namespaces}; ${neutralEntry}`],
      [
        'type-only-validator',
        `import type { ValidateLinkOptions } from ${own}; ${neutralEntry}`,
      ],
      [
        'type-only-requirements',
        `import ${JSON.stringify(path.join(provider, 'src/requirements.ts'))}; ${neutralEntry}`,
      ],
    ]) {
      const result = await measure(name!, entry!)
      expect(result.code).toBe(neutral.code)
    }

    // Import the direct API first in both cases to stabilize bundler naming.
    // The second reference proves the generated alias adds no runtime wrapper.
    const directFactory = await measure(
      'framework-file-factory',
      `import { createFileRoute } from '${routerPackage}'; globalThis.__routeModuleBundleProbe = [createFileRoute, createFileRoute]`,
    )
    const scopedFactory = await measure(
      'generated-file-factory',
      `import { createFileRoute } from '${routerPackage}'; import { createFileRoute as scoped } from ${own}; globalThis.__routeModuleBundleProbe = [createFileRoute, scoped]`,
    )
    expectIndependentApi(scopedFactory)
    expect(scopedFactory.source).not.toContain('@bundle/provider')
    expect(sizes(scopedFactory)).toEqual(sizes(directFactory))
    const moduleRootFactory = await measure(
      'generated-module-root',
      `import { createModuleRoot } from ${own}; globalThis.__routeModuleBundleProbe = createModuleRoot`,
    )
    expectIndependentApi(moduleRootFactory)
    expect(moduleRootFactory.source).not.toMatch(
      /\bfunction\s+createFileRoute\b/,
    )

    const ownOptions = await measure(
      'own-link-options',
      `import { linkOptions } from ${own}; globalThis.__routeModuleBundleProbe = linkOptions({ to: '/page' })`,
    )
    const namespaceOptions = await measure(
      'namespace-link-options',
      `import { provider } from ${namespaces}; globalThis.__routeModuleBundleProbe = provider.linkOptions({ to: '/page' })`,
    )
    expectIndependentApi(ownOptions, 'LinkOptions')
    expectIndependentApi(namespaceOptions, 'LinkOptions')
    expect(sizes(namespaceOptions)).toEqual(sizes(ownOptions))

    for (const [api, suffix] of [
      ['Link', 'Link'],
      ['Navigate', 'Navigate'],
      ['getRouteApi', 'GetRouteApi'],
      ['useRouter', 'UseRouter'],
      ['useLinkProps', 'UseLinkProps'],
      ['useBlocker', 'UseBlocker'],
      ['notFound', 'NotFound'],
    ]) {
      const result = await measure(
        api!,
        `import { ${api} } from ${own}; globalThis.__routeModuleBundleProbe = ${api}`,
      )
      expectIndependentApi(result, suffix)
      if (framework === 'solid' && api === 'Link') {
        // Real Solid applications select source exports and compile their JSX.
        expect(result.moduleIds).toContain(
          path
            .join(
              repository,
              'packages/solid-router/dist/source/routeModule.jsx',
            )
            .replaceAll('\\', '/'),
        )
      }
      const namespace = await measure(
        `namespace-${api}`,
        `import { provider } from ${namespaces}; globalThis.__routeModuleBundleProbe = provider.${api}`,
      )
      expectIndependentApi(namespace, suffix)
      expect(sizes(namespace)).toEqual(sizes(result))
    }
    for (const api of ['createServerFn', 'createMiddleware']) {
      const direct = await measure(
        `framework-${api}`,
        `import { ${api} } from '${startPackage}'; globalThis.__routeModuleBundleProbe = [${api}, ${api}]`,
      )
      const generated = await measure(
        `generated-${api}`,
        `import { ${api} } from '${startPackage}'; import { ${api} as scoped } from ${own}; globalThis.__routeModuleBundleProbe = [${api}, scoped]`,
      )
      expectIndependentApi(generated)
      expect(sizes(generated)).toEqual(sizes(direct))
    }
    const fragmentFactory = await measure(
      'createStartModule',
      `import { createStartModule } from ${own}; globalThis.__routeModuleBundleProbe = createStartModule`,
    )
    expectIndependentApi(fragmentFactory)
    expect(fragmentFactory.source).not.toContain('requiredByBundleFixture')

    // Keep real production-byte evidence in the test log for before/after
    // comparison; assertion builds include all runtime dependencies, no externals.
    console.info(JSON.stringify({ generatedApiBundles: framework, results }))
  },
)

test.each(['react', 'solid', 'vue'] as const)(
  '%s requirements augmentation emits declarations without runtime imports',
  async (framework) => {
    const { provider } = await fixtures(framework)
    await write(
      path.join(provider, 'tsconfig.requirements.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: false,
          declaration: true,
          rootDir: './src',
          outDir: './emitted-requirements',
          types: ['node'],
        },
        files: ['src/requirements.ts'],
      }),
    )
    const result = spawnSync(
      process.execPath,
      [
        path.join(repository, 'node_modules/typescript59/lib/tsc.js'),
        '--pretty',
        'false',
        '-p',
        path.join(provider, 'tsconfig.requirements.json'),
      ],
      { encoding: 'utf8' },
    )
    if (result.error) {
      throw result.error
    }
    expect({
      status: result.status,
      diagnostics: result.stdout + result.stderr,
    }).toEqual({ status: 0, diagnostics: '' })
    expect(
      (
        await fs.readFile(
          path.join(provider, 'emitted-requirements/requirements.js'),
          'utf8',
        )
      ).trim(),
    ).toBe('export {};')
    const declaration = await fs.readFile(
      path.join(provider, 'emitted-requirements/requirements.d.ts'),
      'utf8',
    )
    expect(declaration).toContain(
      `declare module '@tanstack/${framework}-start'`,
    )
    expect(declaration).toContain('requiredByBundleFixture')
  },
)
