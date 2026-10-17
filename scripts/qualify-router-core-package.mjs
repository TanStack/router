import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const targets = ['build', 'test:eslint', 'test:unit', 'test:types']
const run = (command, args) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit' })
const read = (command, args) =>
  execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim()

export function releaseContract(environment) {
  return environment.GITHUB_ACTIONS === 'true' &&
    environment.GITHUB_REPOSITORY === 'BleedingDev/router' &&
    environment.GITHUB_EVENT_NAME === 'push' &&
    environment.GITHUB_REF === 'refs/heads/main'
    ? 'router-core-package-v1'
    : environment.GITHUB_ACTIONS === 'true'
      ? 'router-core-ci-candidate-v1'
      : 'router-core-local-candidate-v1'
}

export function validateCoreArchive(source, packed, entries) {
  assert.equal(packed.name, '@tanstack/router-core')
  assert.equal(packed.name, source.name)
  assert.equal(packed.version, source.version)
  for (const requests of [
    packed.dependencies,
    packed.optionalDependencies,
    packed.peerDependencies,
    packed.devDependencies,
  ]) {
    for (const request of Object.values(requests ?? {})) {
      assert.equal(typeof request, 'string')
      assert(
        !/^(?:workspace|catalog|link|file):/.test(request),
        'Packed dependencies must resolve outside the workspace',
      )
    }
  }
  const files = new Set(entries)
  for (const entry of files) {
    assert(
      !entry.startsWith('/') && !entry.split('/').includes('..'),
      'Archive paths must remain inside the package',
    )
  }
  function verifyExports(value) {
    if (typeof value === 'string') {
      assert(value.startsWith('./') && !value.split('/').includes('..'))
      assert(
        files.has(`package/${value.slice(2)}`),
        `Missing packed export: ${value}`,
      )
    } else if (value !== null && typeof value === 'object') {
      for (const target of Object.values(value)) {
        verifyExports(target)
      }
    }
  }
  assert.deepEqual(packed.exports, source.exports)
  verifyExports(packed.exports)
}

export function qualifyCorePackage(directory) {
  assert(directory, 'Provide a new operation-owned output directory')
  const output = path.resolve(directory)
  const workflow = process.env.GITHUB_ACTIONS === 'true'
  const statusBefore = read('git', [
    'status',
    '--porcelain',
    '--untracked-files=normal',
  ])
  // Refuse to mix a new qualification with previous candidate bytes.
  mkdirSync(output)
  const sourceSha = read('git', ['rev-parse', 'HEAD'])
  assert.match(sourceSha, /^[a-f0-9]{40}$/)
  if (workflow) {
    assert.equal(
      statusBefore,
      '',
      'Published workflow artifacts require committed source',
    )
    assert.equal(sourceSha, process.env.GITHUB_SHA)
    assert.equal(process.env.GITHUB_REPOSITORY, 'BleedingDev/router')
  }
  run('pnpm', [
    'nx',
    'run-many',
    `--targets=${targets.join(',')}`,
    '--projects=@tanstack/router-core',
    '--parallel=1',
    '--outputStyle=stream',
    '--skipRemoteCache',
    '--skipNxCache',
  ])
  run('pnpm', [
    '--filter',
    '@tanstack/router-core',
    'pack',
    '--pack-destination',
    output,
  ])
  const archives = readdirSync(output)
  assert.equal(archives.length, 1)
  const archive = archives[0]
  assert.match(archive, /^tanstack-router-core-[0-9][A-Za-z0-9.+-]*\.tgz$/)
  const archivePath = path.join(output, archive)
  const archiveIntegrity = `sha512-${createHash('sha512').update(readFileSync(archivePath)).digest('base64')}`
  const source = JSON.parse(
    readFileSync(path.join(root, 'packages/router-core/package.json')),
  )
  const packed = JSON.parse(
    read('tar', ['-xOf', archivePath, 'package/package.json']),
  )
  validateCoreArchive(
    source,
    packed,
    read('tar', ['-tzf', archivePath]).split('\n'),
  )
  // Check the single packed archive, rather than silently repacking the directory.
  run('pnpm', [
    '--filter',
    '@tanstack/router-core',
    'exec',
    'publint',
    '--strict',
    archivePath,
  ])
  run('pnpm', [
    '--filter',
    '@tanstack/router-core',
    'exec',
    'attw',
    '--profile',
    'node16',
    archivePath,
  ])
  run(process.execPath, [
    path.join(root, 'scripts/accept-router-core-package.mjs'),
    archivePath,
  ])
  assert.equal(
    `sha512-${createHash('sha512').update(readFileSync(archivePath)).digest('base64')}`,
    archiveIntegrity,
    'Package checks must retain the exact packed bytes',
  )
  const headAfter = read('git', ['rev-parse', 'HEAD'])
  const statusAfter = read('git', [
    'status',
    '--porcelain',
    '--untracked-files=normal',
  ])
  if (workflow) {
    assert.equal(headAfter, sourceSha)
    assert.equal(statusAfter, '')
  }
  const manifest = {
    schemaVersion: 1,
    contract: releaseContract(process.env),
    repository: process.env.GITHUB_REPOSITORY ?? 'BleedingDev/router',
    sourceSha,
    ...(!workflow
      ? { sourceState: { headAfter, statusBefore, statusAfter } }
      : {}),
    workflow: '.github/workflows/core-package-qualification.yml',
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    event: process.env.GITHUB_EVENT_NAME ?? 'local',
    ref: process.env.GITHUB_REF ?? null,
    qualification: {
      scope: '@tanstack/router-core',
      targets,
      packageChecks: [
        'publint --strict',
        'attw --profile node16',
        'installed-public-exports-and-types',
      ],
    },
    package: {
      name: packed.name,
      version: packed.version,
      archive,
      integrity: archiveIntegrity,
      dependencies: packed.dependencies ?? {},
    },
  }
  writeFileSync(
    path.join(
      output,
      manifest.contract === 'router-core-package-v1'
        ? 'core-package.json'
        : 'candidate.json',
    ),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  assert.equal(process.argv.length, 3)
  qualifyCorePackage(process.argv[2])
}
