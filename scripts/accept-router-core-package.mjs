import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function consumerEnvironment(environment) {
  return {
    ...Object.fromEntries(
      Object.entries(environment).filter(([key]) => {
        const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
        return !(
          (normalized.startsWith('npmconfig') ||
            normalized.startsWith('pnpmconfig')) &&
          [
            'minimumreleaseage',
            'packageimportmethod',
            'virtualstoredir',
            'storedir',
            'ignoreworkspace',
          ].some((setting) => normalized.includes(setting))
        )
      }),
    ),
    CI: 'true',
  }
}

export function validateConsumerConfiguration(
  configuration,
  modules,
  directory,
  virtualStore,
  store,
) {
  assert.equal(configuration.minimumReleaseAge, 1440)
  assert.equal(configuration.minimumReleaseAgeStrict, true)
  assert.deepEqual(configuration.minimumReleaseAgeExclude, [])
  assert.equal(configuration.packageImportMethod, 'clone-or-copy')
  assert.equal(configuration.trustPolicy, 'no-downgrade')
  assert.equal(path.resolve(configuration.virtualStoreDir), virtualStore)
  if (modules) {
    assert.equal(
      path.resolve(directory, 'node_modules', modules.virtualStoreDir),
      virtualStore,
    )
    assert.equal(path.resolve(modules.storeDir), store)
    assert(
      !store.startsWith(`${directory}${path.sep}`),
      'Content store must remain outside the disposable consumer',
    )
  }
}

export function withConsumerDirectory(
  callback,
  env = process.env,
  guardian = execFileSync,
) {
  const local = env.GITHUB_ACTIONS !== 'true'
  const temporaryRoot = local ? env.OWNED_TEMP_DIR : env.RUNNER_TEMP
  assert(temporaryRoot, 'Local acceptance must run through owned-temp-dir')
  if (local) {
    for (const key of [
      'ROUTER_CORE_VIRTUAL_STORE_ROOT',
      'ROUTER_CORE_STORE_DIR',
    ]) {
      assert(
        env[key] &&
          path.isAbsolute(env[key]) &&
          statSync(env[key]).isDirectory(),
        `Local acceptance requires existing external ${key}`,
      )
    }
  }
  const owner = `router-core-consumer-${process.pid}`
  const resources = []
  const register = (directory, kind) => {
    const resource = { directory, registered: false }
    resources.push(resource)
    if (local && kind) {
      guardian(
        env.DISK_GUARDIAN_ARTIFACTS ?? 'disk-guardian-artifacts',
        [
          'register',
          directory,
          '--owner',
          owner,
          '--owner-pid',
          String(process.pid),
          '--kind',
          kind,
          '--grace-hours',
          '24',
        ],
        { stdio: 'inherit' },
      )
      resource.registered = true
    }
    return directory
  }
  const cleanup = () => {
    const errors = []
    for (const resource of [...resources].reverse()) {
      try {
        assert(
          !resources.some(
            (child) =>
              child !== resource &&
              child.directory.startsWith(`${resource.directory}${path.sep}`),
          ),
          `Retain ${resource.directory} until its child cleanup succeeds`,
        )
        if (resource.registered) {
          guardian(
            env.DISK_GUARDIAN_ARTIFACTS ?? 'disk-guardian-artifacts',
            ['release', resource.directory, '--owner', owner],
            { stdio: 'inherit' },
          )
          resource.registered = false
        }
        rmSync(resource.directory, { recursive: true, force: true })
        resources.splice(resources.indexOf(resource), 1)
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, 'Consumer cleanup failed')
    }
  }
  const signals = [
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ]
  const handlers = signals.map(([signal, code]) => {
    const handler = () => {
      try {
        cleanup()
      } finally {
        process.exit(code)
      }
    }
    process.once(signal, handler)
    return [signal, handler]
  })
  let failure
  try {
    // The enclosing owned-temp-dir lease already owns this local container.
    const directory = register(
      mkdtempSync(path.join(temporaryRoot, 'router-core-consumer-')),
    )
    const modules = path.join(directory, 'node_modules')
    mkdirSync(modules)
    register(modules, 'dependencies')
    const external = local
      ? register(
          mkdtempSync(
            path.join(
              env.ROUTER_CORE_VIRTUAL_STORE_ROOT,
              'router-core-consumer-',
            ),
          ),
        )
      : undefined
    if (external) {
      const externalModules = path.join(external, 'node_modules')
      mkdirSync(externalModules)
      register(externalModules, 'dependencies')
    }
    return callback(
      directory,
      external ? path.join(external, 'node_modules', '.pnpm') : undefined,
    )
  } catch (error) {
    failure = error
    throw error
  } finally {
    for (const [signal, handler] of handlers) {
      process.off(signal, handler)
    }
    try {
      cleanup()
    } catch (error) {
      if (!failure) {
        throw error
      }
      console.error(error)
    }
  }
}

export function acceptCorePackage(archive) {
  archive = path.resolve(archive)
  assert.match(archive, /tanstack-router-core-[0-9][A-Za-z0-9.+-]*\.tgz$/)
  const packed = JSON.parse(
    execFileSync('tar', ['-xOf', archive, 'package/package.json']),
  )
  assert.equal(packed.name, '@tanstack/router-core')
  const root = fileURLToPath(new URL('../', import.meta.url))
  const compiler = path.join(root, 'node_modules/typescript/lib/tsc.js')
  return withConsumerDirectory((directory, virtualStoreDir) => {
    const virtualStore =
      virtualStoreDir ?? path.join(directory, 'node_modules', '.pnpm')
    const policy = [
      'minimumReleaseAge: 1440',
      'minimumReleaseAgeStrict: true',
      'minimumReleaseAgeExclude: []',
      'packageImportMethod: clone-or-copy',
      'trustPolicy: no-downgrade',
      ...(process.env.ROUTER_CORE_STORE_DIR
        ? [`storeDir: ${JSON.stringify(process.env.ROUTER_CORE_STORE_DIR)}`]
        : []),
      `virtualStoreDir: ${JSON.stringify(virtualStore)}`,
      '',
    ].join('\n')
    const environment = consumerEnvironment(process.env)
    const run = (executable, args, options = {}) =>
      execFileSync(executable, args, {
        cwd: directory,
        stdio: 'inherit',
        env: environment,
        ...options,
      })
    const read = (args) =>
      execFileSync('pnpm', args, {
        cwd: directory,
        env: environment,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      }).trim()
    const configuration = () =>
      Object.fromEntries(
        [
          'minimumReleaseAge',
          'minimumReleaseAgeStrict',
          'minimumReleaseAgeExclude',
          'packageImportMethod',
          'trustPolicy',
          'virtualStoreDir',
          ...(process.env.ROUTER_CORE_STORE_DIR ? ['storeDir'] : []),
        ].map((setting) => [
          setting,
          JSON.parse(read(['config', 'get', setting, '--json'])),
        ]),
      )

    writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        packageManager: JSON.parse(
          readFileSync(path.join(root, 'package.json')),
        ).packageManager,
        dependencies: { '@tanstack/router-core': `file:${archive}` },
      }),
    )
    writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), policy)
    const effective = configuration()
    validateConsumerConfiguration(effective, undefined, directory, virtualStore)
    if (process.env.ROUTER_CORE_STORE_DIR) {
      assert.equal(
        path.resolve(effective.storeDir),
        path.resolve(process.env.ROUTER_CORE_STORE_DIR),
      )
    }
    // The nearest consumer workspace owns the policy. --ignore-workspace would discard it.
    run('pnpm', ['install', '--no-frozen-lockfile'])
    assert.equal(
      readFileSync(path.join(directory, 'pnpm-workspace.yaml'), 'utf8'),
      policy,
      'Consumer install must not add release-age exemptions',
    )
    assert.deepEqual(
      configuration(),
      effective,
      'Install must retain the effective consumer policy',
    )
    const parseYaml = createRequire(
      path.join(root, 'node_modules/nx/package.json'),
    )('yaml').parse
    const modules = parseYaml(
      readFileSync(path.join(directory, 'node_modules/.modules.yaml'), 'utf8'),
    )
    validateConsumerConfiguration(
      effective,
      modules,
      directory,
      virtualStore,
      path.resolve(read(['store', 'path', '--silent'])),
    )
    run(process.execPath, [
      '--input-type=commonjs',
      '--eval',
      `const assert = require('node:assert/strict'); const pkg = require('@tanstack/router-core/package.json'); assert.equal(pkg.name, ${JSON.stringify(packed.name)}); assert.equal(pkg.version, ${JSON.stringify(packed.version)});`,
    ])
    const imports = [
      '@tanstack/router-core',
      '@tanstack/router-core/ssr/server',
      '@tanstack/router-core/ssr/client',
      '@tanstack/router-core/isServer',
      '@tanstack/router-core/scroll-restoration-script',
      '@tanstack/router-core/package.json',
    ]
    for (const specifier of imports) {
      const json = specifier.endsWith('/package.json')
      run(process.execPath, [
        '--input-type=module',
        '--eval',
        `import * as api from ${JSON.stringify(specifier)}${json ? ' with { type: "json" }' : ''}; if (!Object.keys(api).length) throw new Error('Empty ESM export');`,
      ])
      run(process.execPath, [
        '--input-type=commonjs',
        '--eval',
        `const api = require(${JSON.stringify(specifier)}); if (!Object.keys(api).length) throw new Error('Empty CJS export');`,
      ])
    }
    for (const [conditions, environment, expected, target] of [
      [[], 'production', true, 'server'],
      [[], 'development', true, 'server'],
      [[], 'test', undefined, 'server'],
      [['node'], 'production', true, 'server'],
      [['workerd'], 'production', true, 'server'],
      [['worker'], 'production', true, 'server'],
      [['deno'], 'production', true, 'server'],
      [['bun'], 'production', true, 'server'],
      [['browser'], 'production', false, 'client'],
      [['development'], 'production', undefined, 'development'],
      [
        ['development', 'browser', 'workerd'],
        'production',
        undefined,
        'development',
      ],
    ]) {
      for (const format of ['module', 'commonjs']) {
        const resolve =
          format === 'module'
            ? "import.meta.resolve('@tanstack/router-core/isServer')"
            : "require.resolve('@tanstack/router-core/isServer').replaceAll('\\\\', '/')"
        const extension = format === 'module' ? 'js' : 'cjs'
        run(
          process.execPath,
          [
            ...conditions.map((condition) => `--conditions=${condition}`),
            `--input-type=${format}`,
            '--eval',
            `${format === 'module' ? "import { isServer } from '@tanstack/router-core/isServer'" : "const { isServer } = require('@tanstack/router-core/isServer')"}; if (!${resolve}.endsWith('/isServer/${target}.${extension}') || isServer !== ${String(expected)}) throw new Error('Incorrect isServer export');`,
          ],
          {
            env: { ...consumerEnvironment(process.env), NODE_ENV: environment },
          },
        )
      }
    }
    const source = `${imports
      .filter((specifier) => !specifier.endsWith('/package.json'))
      .map(
        (specifier, index) =>
          `import * as api${index} from ${JSON.stringify(specifier)}; void api${index};`,
      )
      .join('\n')}\n`
    writeFileSync(path.join(directory, 'consumer.mts'), source)
    writeFileSync(path.join(directory, 'consumer.cts'), source)
    writeFileSync(
      path.join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          types: [],
          strict: true,
          skipLibCheck: false,
          exactOptionalPropertyTypes: true,
          noUncheckedIndexedAccess: true,
          noImplicitOverride: true,
          noEmit: true,
        },
        files: ['consumer.mts', 'consumer.cts'],
      }),
    )
    run(process.execPath, [compiler, '--project', 'tsconfig.json'])
    console.log(
      `Accepted installed ESM/CJS declarations and exports: ${packed.name}@${packed.version}`,
    )
  })
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  assert.equal(
    process.argv.length,
    3,
    'Expected exactly one normal package archive',
  )
  acceptCorePackage(process.argv[2])
}
