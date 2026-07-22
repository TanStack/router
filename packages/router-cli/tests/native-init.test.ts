import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { parse } from 'yaml'
import {
  NativeScriptScaffoldConflictError,
  initializeNativeScript,
} from '../src/native-init'

const temporaryDirectories: Array<string> = []
const templateDirectory = path.resolve(
  import.meta.dirname,
  '../src/templates/nativescript',
)

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function writeFixture(root: string, mode: 'router' | 'start') {
  await mkdir(path.join(root, 'src'), { recursive: true })

  const dependencies: Record<string, string> = {
    '@tanstack/react-router': '^1.200.0',
    react: '^19.0.0',
  }
  if (mode === 'start') {
    dependencies['@tanstack/react-start'] = '^1.200.0'
  }

  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: `fixture-${mode}`,
        private: true,
        type: 'module',
        scripts: { dev: 'vite dev' },
        dependencies,
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    path.join(root, 'src/router.tsx'),
    'export function getRouter() { return {} }\n',
  )

  return root
}

async function createFixture(mode: 'router' | 'start') {
  const root = await mkdtemp(path.join(tmpdir(), 'tanstack-native-init-'))
  temporaryDirectories.push(root)
  return writeFixture(root, mode)
}

test('initializes a Start app and is idempotent', async () => {
  const root = await createFixture('start')
  const options = {
    root,
    templateDirectory,
    packageManager: 'pnpm' as const,
    install: false,
  }

  const first = await initializeNativeScript(options)
  expect(first.mode).toBe('start')
  expect(first.appId).toBe('org.nativescript.fixturestart')
  expect(first.created).toContain('src/native/index.tsx')
  expect(first.created).toContain(
    'App_Resources/iOS/Assets.xcassets/AppIcon.appiconset/icon-1024.png',
  )
  expect(first.created).toContain('App_Resources/LICENSE')
  expect(first.created).toContain('App_Resources/NOTICE')
  expect(first.created).toContain('pnpm-workspace.yaml')
  expect(first.created).toContain('.gitignore')
  await expect(
    readFile(
      path.join(root, 'App_Resources/Android/src/main/AndroidManifest.xml'),
      'utf8',
    ),
  ).resolves.toContain('@xml/network_security_config')
  await expect(
    readFile(
      path.join(root, 'App_Resources/Android/src/main/AndroidManifest.xml'),
      'utf8',
    ),
  ).resolves.not.toContain('EXTERNAL_STORAGE')
  await expect(
    readFile(path.join(root, 'App_Resources/iOS/Info.plist'), 'utf8'),
  ).resolves.toContain('NSAllowsLocalNetworking')
  await expect(
    readFile(path.join(root, 'App_Resources/LICENSE'), 'utf8'),
  ).resolves.toContain('Apache License')
  await expect(
    readFile(path.join(root, 'App_Resources/NOTICE'), 'utf8'),
  ).resolves.toContain('@nativescript/template-blank')

  const packageJson = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  ) as {
    main: string
    scripts: Record<string, string>
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
  expect(packageJson.main).toBe('src/native/index.tsx')
  expect(packageJson.scripts['native:ios']).toContain('concurrently')
  expect(packageJson.scripts['native:ios']).toContain('pnpm run native:server')
  expect(packageJson.scripts['native:ios']).toContain('ns debug ios --no-hmr')
  expect(packageJson.scripts['native:build:ios']).toContain(
    'ns build ios --release --env.production',
  )
  expect(packageJson.scripts['native:build:android']).toContain(
    'ns build android --release --env.production',
  )
  expect(packageJson.dependencies['@tanstack/react-nativescript-router']).toBe(
    'latest',
  )
  expect(packageJson.devDependencies.vite).toBe('^7.3.6')
  const pnpmWorkspace = parse(
    await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'),
  ) as { allowBuilds: Record<string, boolean> }
  expect(pnpmWorkspace.allowBuilds['@nativescript/core']).toBe(true)
  expect(pnpmWorkspace.allowBuilds['@parcel/watcher']).toBe(true)
  expect(pnpmWorkspace.allowBuilds.esbuild).toBe(true)
  expect(pnpmWorkspace.allowBuilds.lmdb).toBe(false)
  expect(pnpmWorkspace.allowBuilds['msgpackr-extract']).toBe(false)
  await expect(
    readFile(path.join(root, 'vite.native.config.ts'), 'utf8'),
  ).resolves.toContain('tanstackStartNativeScript')
  await expect(
    readFile(path.join(root, 'vite.native.config.ts'), 'utf8'),
  ).resolves.toContain("serverFnMode: mode === 'production' ? 'build' : 'dev'")

  const second = await initializeNativeScript(options)
  expect(second.created).toEqual([])
  expect(second.updated).toEqual([])
  expect(second.unchanged).toContain('package.json')
  expect(second.unchanged).toContain('.gitignore')
  expect(second.unchanged).toContain('pnpm-workspace.yaml')
  expect(second.unchanged).toContain('src/native/index.tsx')
})

test('merges pnpm build trust into the nearest workspace config', async () => {
  const workspace = await mkdtemp(
    path.join(tmpdir(), 'tanstack-native-workspace-'),
  )
  temporaryDirectories.push(workspace)
  const root = await writeFixture(path.join(workspace, 'apps/app'), 'start')
  const workspaceFile = path.join(workspace, 'pnpm-workspace.yaml')
  await writeFile(
    workspaceFile,
    "# existing workspace\npackages:\n  - 'apps/*'\nallowBuilds:\n  esbuild: true\n",
  )
  await writeFile(path.join(root, '.gitignore'), '# existing ignore\ndist/\n')

  const result = await initializeNativeScript({
    root,
    templateDirectory,
    packageManager: 'pnpm',
    install: false,
  })

  expect(result.updated).toContain('../../pnpm-workspace.yaml')
  const contents = await readFile(workspaceFile, 'utf8')
  expect(contents).toContain('# existing workspace')
  expect(contents).toContain("- 'apps/*'")
  expect(contents).toContain('esbuild: true')
  const config = parse(contents) as {
    allowBuilds: Record<string, boolean>
  }
  expect(config.allowBuilds['@nativescript/core']).toBe(true)
  expect(config.allowBuilds.nativescript).toBe(true)
  const gitIgnore = await readFile(path.join(root, '.gitignore'), 'utf8')
  expect(gitIgnore).toContain('# existing ignore')
  expect(gitIgnore).toContain('dist/')
  expect(gitIgnore).toContain('.ns-vite-build/')
})

test('does not override an explicit pnpm build denial without force', async () => {
  const root = await createFixture('start')
  const workspaceFile = path.join(root, 'pnpm-workspace.yaml')
  const contents = "allowBuilds:\n  '@nativescript/core': false\n"
  await writeFile(workspaceFile, contents)

  await expect(
    initializeNativeScript({
      root,
      templateDirectory,
      packageManager: 'pnpm',
      install: false,
    }),
  ).rejects.toMatchObject({
    conflicts: ['pnpm-workspace.yaml#allowBuilds.@nativescript/core'],
  })
  await expect(readFile(workspaceFile, 'utf8')).resolves.toBe(contents)
  await expect(
    readFile(path.join(root, 'vite.native.config.ts'), 'utf8'),
  ).rejects.toThrow()

  await initializeNativeScript({
    root,
    templateDirectory,
    packageManager: 'pnpm',
    install: false,
    force: true,
  })
  const forcedConfig = parse(await readFile(workspaceFile, 'utf8')) as {
    allowBuilds: Record<string, boolean>
  }
  expect(forcedConfig.allowBuilds['@nativescript/core']).toBe(true)
})

test('initializes a Router-only app with the shared NativeScript Vite bridge', async () => {
  const root = await createFixture('router')
  await initializeNativeScript({
    root,
    templateDirectory,
    packageManager: 'npm',
    install: false,
  })

  const viteConfig = await readFile(
    path.join(root, 'vite.native.config.ts'),
    'utf8',
  )
  expect(viteConfig).toContain('tanstackReactNativeScript')
  expect(viteConfig).toContain('tanstackRouterGenerator')
  expect(viteConfig).not.toContain('tanstackStartNativeScript')

  const packageJson = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  ) as {
    devDependencies: Record<string, string>
  }
  expect(packageJson.devDependencies['@tanstack/router-plugin']).toBe(
    '^1.200.0',
  )
})

test('rejects React 18 before writing files', async () => {
  const root = await createFixture('router')
  const packageJsonPath = path.join(root, 'package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    dependencies: Record<string, string>
  }
  packageJson.dependencies.react = '^18.3.1'
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)

  await expect(
    initializeNativeScript({
      root,
      templateDirectory,
      packageManager: 'npm',
      install: false,
    }),
  ).rejects.toThrow('requires React 19')
  await expect(
    readFile(path.join(root, 'vite.native.config.ts'), 'utf8'),
  ).rejects.toThrow()
})

test('rejects React 20 before writing files', async () => {
  const root = await createFixture('router')
  const packageJsonPath = path.join(root, 'package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    dependencies: Record<string, string>
  }
  packageJson.dependencies.react = '^20.0.0'
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)

  await expect(
    initializeNativeScript({
      root,
      templateDirectory,
      packageManager: 'npm',
      install: false,
    }),
  ).rejects.toThrow('requires React 19')
  await expect(
    readFile(path.join(root, 'vite.native.config.ts'), 'utf8'),
  ).rejects.toThrow()
})

test.each(['^19.0.0 || ^20.0.0', '>=19.0.0'])(
  'rejects ambiguous React range %s before writing files',
  async (reactVersion) => {
    const root = await createFixture('router')
    const packageJsonPath = path.join(root, 'package.json')
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
      dependencies: Record<string, string>
    }
    packageJson.dependencies.react = reactVersion
    await writeFile(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
    )

    await expect(
      initializeNativeScript({
        root,
        templateDirectory,
        packageManager: 'npm',
        install: false,
      }),
    ).rejects.toThrow('requires React 19')
    await expect(
      readFile(path.join(root, 'vite.native.config.ts'), 'utf8'),
    ).rejects.toThrow()
  },
)

test('rejects an invalid server function base before writing files', async () => {
  const root = await createFixture('start')

  await expect(
    initializeNativeScript({
      root,
      templateDirectory,
      packageManager: 'npm',
      serverFnBase: '/_serverFn/',
      install: false,
    }),
  ).rejects.toThrow('must be an absolute URL')
  await expect(
    readFile(path.join(root, 'vite.native.config.ts'), 'utf8'),
  ).rejects.toThrow()
})

test('rejects Vite 8 atomically and replaces it only with force', async () => {
  const root = await createFixture('start')
  const packageJsonPath = path.join(root, 'package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    devDependencies?: Record<string, string>
  }
  packageJson.devDependencies = { vite: '^8.0.0' }
  const packageJsonBefore = `${JSON.stringify(packageJson, null, 2)}\n`
  await writeFile(packageJsonPath, packageJsonBefore)

  const options = {
    root,
    templateDirectory,
    packageManager: 'pnpm' as const,
    install: false,
  }
  await expect(initializeNativeScript(options)).rejects.toMatchObject({
    conflicts: ['package.json#devDependencies.vite'],
  })
  await expect(readFile(packageJsonPath, 'utf8')).resolves.toBe(
    packageJsonBefore,
  )
  await expect(
    readFile(path.join(root, 'vite.native.config.ts'), 'utf8'),
  ).rejects.toThrow()

  await initializeNativeScript({ ...options, force: true })
  const forcedPackageJson = JSON.parse(
    await readFile(packageJsonPath, 'utf8'),
  ) as {
    devDependencies: Record<string, string>
  }
  expect(forcedPackageJson.devDependencies.vite).toBe('^7.3.6')
})

test('preflights conflicts before changing the project', async () => {
  const root = await createFixture('start')
  const options = {
    root,
    templateDirectory,
    packageManager: 'pnpm' as const,
    install: false,
  }
  await initializeNativeScript(options)

  const viteConfigPath = path.join(root, 'vite.native.config.ts')
  await writeFile(viteConfigPath, '// user configuration\n')
  const packageJsonPath = path.join(root, 'package.json')
  const packageJsonBefore = await readFile(packageJsonPath, 'utf8')

  await expect(
    initializeNativeScript({ ...options, serverPort: 4000 }),
  ).rejects.toBeInstanceOf(NativeScriptScaffoldConflictError)
  await expect(readFile(viteConfigPath, 'utf8')).resolves.toBe(
    '// user configuration\n',
  )
  await expect(readFile(packageJsonPath, 'utf8')).resolves.toBe(
    packageJsonBefore,
  )

  await initializeNativeScript({ ...options, force: true })
  await expect(readFile(viteConfigPath, 'utf8')).resolves.toContain(
    'tanstackStartNativeScript',
  )
})
