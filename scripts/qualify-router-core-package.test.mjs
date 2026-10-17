import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import path from 'node:path'
import {
  consumerEnvironment,
  validateConsumerConfiguration,
  withConsumerDirectory,
} from './accept-router-core-package.mjs'
import {
  releaseContract,
  validateCoreArchive,
} from './qualify-router-core-package.mjs'

const source = {
  name: '@tanstack/router-core',
  version: '1.171.37',
  exports: {
    '.': { import: './dist/esm/index.js', require: './dist/cjs/index.cjs' },
  },
}
const packed = { ...source, dependencies: { '@tanstack/history': '1.162.5' } }
const entries = ['package/dist/esm/index.js', 'package/dist/cjs/index.cjs']

test('only fork push-main events can produce the release contract', () => {
  const environment = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'BleedingDev/router',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/main',
  }
  assert.equal(releaseContract(environment), 'router-core-package-v1')
  for (const change of [
    { GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/5/merge' },
    { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_REPOSITORY: 'another/router' },
  ]) {
    assert.equal(
      releaseContract({ ...environment, ...change }),
      'router-core-ci-candidate-v1',
    )
  }
  assert.equal(releaseContract({}), 'router-core-local-candidate-v1')
})

test('consumer policy cannot inherit age exemptions or store overrides', () => {
  const clean = consumerEnvironment({
    npm_config_minimum_release_age: '0',
    PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE: '*',
    npm_config_virtual_store_dir: '/wrong',
    npm_config_store_dir: '/wrong',
    npm_config_ignore_workspace: 'true',
    npm_config_package_import_method: 'hardlink',
    npm_config_registry: 'https://registry.npmjs.org/',
  })
  assert.deepEqual(clean, {
    CI: 'true',
    npm_config_registry: 'https://registry.npmjs.org/',
  })
})

test('effective policy and installed metadata must use strict ages and intended stores', () => {
  const configuration = {
    minimumReleaseAge: 1440,
    minimumReleaseAgeStrict: true,
    minimumReleaseAgeExclude: [],
    packageImportMethod: 'clone-or-copy',
    trustPolicy: 'no-downgrade',
    virtualStoreDir: '/external/run/node_modules/.pnpm',
  }
  const modules = {
    virtualStoreDir: '/external/run/node_modules/.pnpm',
    storeDir: '/external/shared-store/v11',
  }
  const check = (config = configuration, metadata = modules) =>
    validateConsumerConfiguration(
      config,
      metadata,
      '/consumer',
      configuration.virtualStoreDir,
      '/external/shared-store/v11',
    )
  check()
  for (const change of [
    { minimumReleaseAge: 0 },
    { minimumReleaseAgeStrict: false },
    { minimumReleaseAgeExclude: ['*'] },
    { packageImportMethod: 'hardlink' },
  ]) {
    assert.throws(() => check({ ...configuration, ...change }))
  }
  assert.throws(() =>
    check(configuration, { ...modules, virtualStoreDir: '.pnpm' }),
  )
  assert.throws(() =>
    check(configuration, { ...modules, storeDir: '/consumer/store' }),
  )
})

test('normal archive retains its owning version and both public module formats', () => {
  validateCoreArchive(source, packed, entries)
})
test('rejects relabelled packages and missing packed exports', () => {
  assert.throws(() =>
    validateCoreArchive(source, { ...packed, version: '1.171.34' }, entries),
  )
  assert.throws(() => validateCoreArchive(source, packed, entries.slice(0, 1)))
  assert.throws(() =>
    validateCoreArchive(source, { ...packed, exports: {} }, entries),
  )
})
test('rejects dependencies that only resolve inside the producer workspace', () => {
  for (const request of [
    'workspace:*',
    'catalog:',
    'link:../history',
    'file:../history',
  ]) {
    assert.throws(() =>
      validateCoreArchive(
        source,
        {
          ...packed,
          dependencies: { '@tanstack/history': request },
        },
        entries,
      ),
    )
  }
})
test('rejects package archive traversal', () => {
  assert.throws(() =>
    validateCoreArchive(source, packed, [...entries, 'package/../outside']),
  )
  assert.throws(() =>
    validateCoreArchive(source, packed, [...entries, '/outside']),
  )
})

for (const failure of ['none', 'first-registration', 'installed-consumer']) {
  test(`consumer owns and cleans its local and external paths: ${failure}`, () => {
    const temporaryRoot = process.env.OWNED_TEMP_DIR ?? process.env.RUNNER_TEMP
    assert(temporaryRoot, 'Run filesystem tests through owned-temp-dir')
    const base = mkdtempSync(
      path.join(temporaryRoot, 'core-consumer-lifecycle-'),
    )
    try {
      const store = path.join(base, 'shared-store')
      const virtualRoot = path.join(base, 'external-virtual-stores')
      mkdirSync(store)
      mkdirSync(virtualRoot)
      const calls = []
      const original = new Error(failure)
      const env = {
        OWNED_TEMP_DIR: base,
        ROUTER_CORE_STORE_DIR: store,
        ROUTER_CORE_VIRTUAL_STORE_ROOT: virtualRoot,
      }
      const guardian = (_command, args) => {
        calls.push(args)
        assert.equal(path.basename(args[1]), 'node_modules')
        assert(
          existsSync(args[1]),
          'Release must precede deletion of its registered identity',
        )
        if (failure === 'first-registration' && calls.length === 1) {
          throw original
        }
      }
      const execute = () =>
        withConsumerDirectory(
          (directory, virtualStore) => {
            assert(existsSync(path.join(directory, 'node_modules')))
            assert(virtualStore.startsWith(`${virtualRoot}${path.sep}`))
            if (failure === 'installed-consumer') {
              throw original
            }
          },
          env,
          guardian,
        )
      if (failure === 'none') {
        execute()
      } else {
        assert.throws(execute, (error) => error === original)
      }
      assert.deepEqual(readdirSync(virtualRoot), [])
      assert.deepEqual(readdirSync(base).sort(), [
        'external-virtual-stores',
        'shared-store',
      ])
      const registered = calls.filter(([operation]) => operation === 'register')
      const released = calls.filter(([operation]) => operation === 'release')
      assert.equal(
        released.length,
        failure === 'first-registration' ? 0 : registered.length,
      )
      for (const [, directory] of registered) {
        assert(!existsSync(directory))
      }
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
}
