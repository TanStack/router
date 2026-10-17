import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  publishCoreRelease,
  validateCoreReleaseCohort,
  validateCoreReleaseArtifact,
  validateCorePromotionEnvironment,
  validateCoreReleaseRun,
} from './ultramodern-core-release.mjs'

const sha = 'a'.repeat(40)
const source = {
  name: '@tanstack/router-core',
  version: '1.171.38',
  dependencies: { '@tanstack/history': '1.162.5' },
  exports: { '.': './index.js' },
}
const run = {
  id: 123,
  repository: { id: 456, full_name: 'BleedingDev/router' },
  head_repository: { id: 456, full_name: 'BleedingDev/router' },
  path: '.github/workflows/core-package-qualification.yml',
  event: 'push',
  head_branch: 'main',
  status: 'completed',
  conclusion: 'success',
  head_sha: sha,
  run_attempt: 1,
  workflow_id: 789,
  html_url: 'https://github.com/BleedingDev/router/actions/runs/123',
}
const jobs = [
  {
    name: 'Qualify the normal router-core package',
    status: 'completed',
    conclusion: 'success',
    head_sha: sha,
    run_attempt: 1,
  },
]
const environment = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'BleedingDev/router',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
}

test('only manual fork-main dispatch can publish', () => {
  validateCorePromotionEnvironment(environment)
  for (const change of [
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REPOSITORY: 'TanStack/router' },
    { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_REF: 'refs/heads/feature' },
  ]) {
    assert.throws(() =>
      validateCorePromotionEnvironment({ ...environment, ...change }),
    )
  }
})

test('only completed successful fork push-main exact-package qualification can promote', () => {
  assert.deepEqual(validateCoreReleaseRun(run, jobs), {
    sha,
    packageAttempt: 1,
  })
  for (const change of [
    { repository: { id: 456, full_name: 'TanStack/router' } },
    { head_repository: { id: 999, full_name: 'BleedingDev/router' } },
    { path: '.github/workflows/fork-qualification.yml' },
    { path: '.github/workflows/core-package-qualification.yml.backup' },
    { event: 'pull_request' },
    { event: 'workflow_dispatch' },
    { head_branch: 'feature' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { run_attempt: 0 },
    { run_attempt: 2 },
    { head_sha: '../escape' },
  ]) {
    assert.throws(() => validateCoreReleaseRun({ ...run, ...change }, jobs))
  }
  assert.deepEqual(
    validateCoreReleaseRun(
      { ...run, path: `${run.path}@refs/heads/main` },
      jobs,
    ),
    { sha, packageAttempt: 1 },
  )
  for (const change of [
    { conclusion: 'failure' },
    { conclusion: 'skipped' },
    { status: 'in_progress' },
    { head_sha: 'b'.repeat(40) },
    { run_attempt: 2 },
  ]) {
    assert.throws(() =>
      validateCoreReleaseRun(run, [{ ...jobs[0], ...change }]),
    )
  }
  assert.throws(() => validateCoreReleaseRun(run, []))
  assert.throws(() => validateCoreReleaseRun(run, [...jobs, ...jobs]))
  const later = { ...jobs[0], run_attempt: 2 }
  for (const all of [
    [...jobs, { ...later, conclusion: 'failure' }],
    [{ ...later, conclusion: 'failure' }, ...jobs],
  ]) {
    assert.throws(() => validateCoreReleaseRun({ ...run, run_attempt: 2 }, all))
  }
  assert.deepEqual(
    validateCoreReleaseRun({ ...run, run_attempt: 2 }, [...jobs, later]),
    { sha, packageAttempt: 2 },
  )
})

test('accepted artifact metadata binds one unexpired archive to its exact repository, run and attempt', () => {
  const artifact = {
    id: 321,
    name: 'router-core-package-123-1',
    expired: false,
    size_in_bytes: 42,
    digest: `sha256:${'a'.repeat(64)}`,
    workflow_run: {
      id: 123,
      head_sha: sha,
      head_branch: 'main',
      repository_id: 456,
      head_repository_id: 456,
    },
  }
  assert.equal(validateCoreReleaseArtifact([artifact], '123', run, 1), artifact)
  assert.throws(() => validateCoreReleaseArtifact([], '123', run, 1))
  assert.throws(() =>
    validateCoreReleaseArtifact([artifact, artifact], '123', run, 1),
  )
  for (const change of [
    { id: 0 },
    { name: 'router-core-package-123-2' },
    { expired: true },
    { size_in_bytes: 0 },
    { digest: 'sha256:missing' },
  ]) {
    assert.throws(() =>
      validateCoreReleaseArtifact([{ ...artifact, ...change }], '123', run, 1),
    )
  }
  for (const change of [
    { id: 999 },
    { head_sha: 'b'.repeat(40) },
    { head_branch: 'feature' },
    { repository_id: 999 },
    { head_repository_id: 999 },
  ]) {
    assert.throws(() =>
      validateCoreReleaseArtifact(
        [
          {
            ...artifact,
            workflow_run: { ...artifact.workflow_run, ...change },
          },
        ],
        '123',
        run,
        1,
      ),
    )
  }
})

function fixture(context) {
  const root = mkdtempSync(
    path.join(
      process.env.OWNED_TEMP_DIR ?? process.env.RUNNER_TEMP ?? tmpdir(),
      'router-core-release-test-',
    ),
  )
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const accepted = path.join(root, 'accepted')
  mkdirSync(accepted)
  const packed = path.join(root, 'source/package')
  mkdirSync(packed, { recursive: true })
  writeFileSync(
    path.join(packed, 'package.json'),
    JSON.stringify({
      ...source,
      dependencies: { '@tanstack/history': '1.162.5' },
    }),
  )
  writeFileSync(path.join(packed, 'index.js'), 'export const accepted = true\n')
  const archive = 'tanstack-router-core-1.171.38.tgz'
  execFileSync('tar', [
    '-czf',
    path.join(accepted, archive),
    '-C',
    path.dirname(packed),
    'package',
  ])
  const cohort = {
    schemaVersion: 1,
    repository: 'BleedingDev/router',
    contract: 'router-core-package-v1',
    sourceSha: sha,
    workflow: '.github/workflows/core-package-qualification.yml',
    runId: '123',
    runAttempt: '1',
    event: 'push',
    ref: 'refs/heads/main',
    qualification: {
      scope: '@tanstack/router-core',
      targets: ['build', 'test:eslint', 'test:unit', 'test:types'],
      packageChecks: [
        'publint --strict',
        'attw --profile node16',
        'installed-public-exports-and-types',
      ],
    },
    package: {
      name: source.name,
      version: source.version,
      archive,
      dependencies: { '@tanstack/history': '1.162.5' },
      integrity: `sha512-${createHash('sha512')
        .update(readFileSync(path.join(accepted, archive)))
        .digest('base64')}`,
    },
  }
  const save = () =>
    writeFileSync(
      path.join(accepted, 'core-package.json'),
      JSON.stringify(cohort),
    )
  save()
  return { root, accepted, cohort, save }
}

test('binds accepted archive bytes to exact attempt, source, package and qualification', (context) => {
  const f = fixture(context)
  const validate = () =>
    validateCoreReleaseCohort(f.accepted, '123', run, 1, source)
  assert.deepEqual(validate(), ['core-package.json', f.cohort.package.archive])
  const workspaceSource = {
    ...source,
    dependencies: { '@tanstack/history': 'workspace:*' },
  }
  assert.deepEqual(
    validateCoreReleaseCohort(f.accepted, '123', run, 1, workspaceSource, {
      '@tanstack/history': '1.162.5',
    }),
    ['core-package.json', f.cohort.package.archive],
  )
  assert.throws(() =>
    validateCoreReleaseCohort(f.accepted, '123', run, 1, workspaceSource),
  )
  assert.throws(() =>
    validateCoreReleaseCohort(f.accepted, '123', run, 1, workspaceSource, {
      '@tanstack/history': '1.162.4',
    }),
  )

  for (const [key, value] of Object.entries({
    schemaVersion: 2,
    repository: 'TanStack/router',
    sourceSha: 'b'.repeat(40),
    contract: 'router-core-ci-candidate-v1',
    workflow: 'other.yml',
    runId: '124',
    runAttempt: '2',
    event: 'pull_request',
    ref: 'refs/pull/1/merge',
  })) {
    const previous = f.cohort[key]
    f.cohort[key] = value
    f.save()
    assert.throws(validate)
    f.cohort[key] = previous
  }
  for (const [key, value] of Object.entries({
    name: '@foreign/router-core',
    version: '9.9.9',
    archive: '../outside.tgz',
    integrity: 'sha512-incorrect',
    dependencies: {},
  })) {
    const previous = f.cohort.package[key]
    f.cohort.package[key] = value
    f.save()
    assert.throws(validate)
    f.cohort.package[key] = previous
  }
  f.cohort.qualification.packageChecks = []
  f.save()
  assert.throws(validate)
  f.cohort.qualification.packageChecks = [
    'publint --strict',
    'attw --profile node16',
    'installed-public-exports-and-types',
  ]
  f.save()
  writeFileSync(path.join(f.accepted, 'unexpected.tgz'), 'unaccepted archive')
  assert.throws(validate)
  rmSync(path.join(f.accepted, 'unexpected.tgz'))
  const archivePath = path.join(f.accepted, f.cohort.package.archive)
  const outside = path.join(f.root, 'original.tgz')
  cpSync(archivePath, outside)
  rmSync(archivePath)
  symlinkSync(outside, archivePath)
  assert.throws(validate, /regular file/)
  rmSync(archivePath)
  writeFileSync(archivePath, 'tampered')
  assert.throws(validate)
})

function promotion(context) {
  const f = fixture(context)
  const temporaryRoot = path.join(f.root, 'temporary')
  mkdirSync(temporaryRoot)
  const sentinel = path.join(temporaryRoot, 'caller-owned.txt')
  writeFileSync(sentinel, 'preserve')
  const tag = `ultramodern-router-core-${sha.slice(0, 12)}`
  const state = {
    release: undefined,
    assets: new Map(),
    assetMetadata: new Map(),
    jobs: jobs.map((job) => ({ ...job })),
    deletes: 0,
    nextAssetId: 1,
    immutableOnPublish: true,
    duplicateReleaseListing: false,
    responseReleaseId: 501,
    responseAssetId: undefined,
    returnAssetText: false,
    artifactChanges: {},
    runChanges: {},
    tagShaOnPublish: sha,
    corruptOnPublish: false,
    failAssetDownload: false,
    uploads: 0,
    creates: 0,
    edits: 0,
    tagSha: undefined,
    failAfterOneUpload: false,
    failDownload: false,
    ancestryFailure: false,
  }
  let zipSignature
  let zipBytes
  const artifactZip = () => {
    const signature = createHash('sha256')
      .update(readFileSync(path.join(f.accepted, 'core-package.json')))
      .update(readFileSync(path.join(f.accepted, f.cohort.package.archive)))
      .digest('hex')
    if (signature !== zipSignature) {
      const filename = path.join(f.root, 'artifact.zip')
      rmSync(filename, { force: true })
      execFileSync(
        'zip',
        ['-q', filename, 'core-package.json', f.cohort.package.archive],
        { cwd: f.accepted },
      )
      zipBytes = readFileSync(filename)
      zipSignature = signature
    }
    return zipBytes
  }
  const commands = {
    temporaryRoot,
    environment,
    downloadArtifact: (id) => {
      assert.equal(id, 321)
      if (state.failDownload) {
        throw new Error('Download interrupted')
      }
      return artifactZip()
    },
    downloadAsset: (id) => {
      assert(Number.isSafeInteger(id) && id > 0)
      const entry = [...state.assetMetadata].find(
        ([, asset]) => asset.id === id,
      )
      assert(entry, 'Download only the exact identified release asset')
      if (state.failAssetDownload) {
        throw new Error('Asset transport failure')
      }
      const bytes = state.assets.get(entry[0])
      return state.returnAssetText ? bytes.toString('utf8') : bytes
    },
    git: (...args) => {
      if (args[0] === 'remote') {
        return 'https://github.com/BleedingDev/router.git\n'
      }
      if (args[0] === 'merge-base') {
        assert.deepEqual(args, [
          'merge-base',
          '--is-ancestor',
          sha,
          'origin/main',
        ])
        if (state.ancestryFailure) {
          throw new Error('Not an ancestor')
        }
        return ''
      }
      assert.deepEqual(args, [
        'show',
        `${sha}:packages/router-core/package.json`,
      ])
      return JSON.stringify(source)
    },
    gh: (...args) => {
      if (args[0] === 'api') {
        if (args[1] === '--method') {
          assert.equal(args[2], 'DELETE')
          assert.equal(
            state.release.draft,
            true,
            'Never mutate published assets',
          )
          const id = Number(args[3].split('/').at(-1))
          const entry = [...state.assetMetadata].find(
            ([, asset]) => asset.id === id,
          )
          assert(entry, 'Delete only the identified draft asset')
          state.assets.delete(entry[0])
          state.assetMetadata.delete(entry[0])
          state.deletes++
          return ''
        }
        if (args[1].includes('/actions/workflows/')) {
          return JSON.stringify({
            id: 789,
            path: '.github/workflows/core-package-qualification.yml',
            state: 'active',
          })
        }
        if (args[1].includes('/artifacts?')) {
          return JSON.stringify([
            {
              artifacts: [
                {
                  id: 321,
                  name: `router-core-package-123-${f.cohort.runAttempt}`,
                  expired: false,
                  size_in_bytes: artifactZip().length,
                  digest: `sha256:${createHash('sha256').update(artifactZip()).digest('hex')}`,
                  workflow_run: {
                    id: 123,
                    head_sha: sha,
                    head_branch: 'main',
                    repository_id: 456,
                    head_repository_id: 456,
                  },
                  ...state.artifactChanges,
                },
              ],
            },
          ])
        }
        if (args[1].endsWith('/runs/123')) {
          return JSON.stringify({
            ...run,
            run_attempt: Math.max(...state.jobs.map((job) => job.run_attempt)),
            ...state.runChanges,
          })
        }
        if (args[1].includes('/jobs?')) {
          assert(args.includes('--paginate') && args.includes('--slurp'))
          return JSON.stringify([
            { jobs: state.jobs.slice(0, 5) },
            { jobs: state.jobs.slice(5) },
          ])
        }
        if (args[1].includes('/matching-refs/')) {
          return JSON.stringify(
            state.tagSha
              ? [
                  {
                    ref: `refs/tags/${tag}`,
                    object: { type: 'commit', sha: state.tagSha },
                  },
                ]
              : [],
          )
        }
        if (args[1] === 'repos/BleedingDev/router/releases?per_page=100') {
          assert(args.includes('--paginate') && args.includes('--slurp'))
          const release = state.release
            ? { ...state.release, id: 501 }
            : undefined
          return JSON.stringify([
            [{ id: 900, tag_name: 'another-source-tag' }],
            release
              ? state.duplicateReleaseListing
                ? [release, { ...release, id: 502 }]
                : [release]
              : [],
          ])
        }
        const field = (key) =>
          args
            .find((argument) => argument.startsWith(`${key}=`))
            ?.slice(key.length + 1)
        const metadata = () => ({
          ...state.release,
          id: state.responseReleaseId,
          assets: [...state.assets.keys()].map((name) => ({
            name,
            ...state.assetMetadata.get(name),
          })),
        })
        if (args[1] === 'repos/BleedingDev/router/releases') {
          assert(args.includes('--method') && args.includes('POST'))
          assert.equal(state.release, undefined)
          assert.equal(field('tag_name'), tag)
          assert.equal(field('target_commitish'), sha)
          assert.equal(field('draft'), 'true')
          assert.equal(field('prerelease'), 'false')
          state.release = {
            id: 501,
            tag_name: tag,
            target_commitish: sha,
            draft: true,
            prerelease: false,
            name: field('name'),
            body: field('body'),
          }
          state.creates++
          return JSON.stringify(metadata())
        }
        if (
          args[1].startsWith(
            'https://uploads.github.com/repos/BleedingDev/router/releases/501/assets?name=',
          )
        ) {
          assert.equal(
            state.release.draft,
            true,
            'Never upload to a published release',
          )
          assert(args.includes('--method') && args.includes('POST'))
          assert(
            !args.includes('--hostname'),
            'Use the exact GitHub uploads URL',
          )
          assert.equal(
            args[args.indexOf('-H') + 1],
            'Content-Type: application/octet-stream',
          )
          const file = args[args.indexOf('--input') + 1]
          const name = decodeURIComponent(args[1].split('?name=')[1])
          assert.equal(name, path.basename(file))
          assert(!state.assets.has(name), 'Never overwrite an existing asset')
          const interrupted = state.failAfterOneUpload && state.uploads === 1
          state.assets.set(
            name,
            interrupted ? Buffer.alloc(0) : readFileSync(file),
          )
          const id = state.nextAssetId++
          const asset = {
            name,
            id,
            state: interrupted ? 'starter' : 'uploaded',
            url: `https://api.github.com/repos/BleedingDev/router/releases/assets/${id}`,
          }
          state.assetMetadata.set(name, asset)
          if (interrupted) {
            throw new Error('Upload interrupted')
          }
          state.uploads++
          return JSON.stringify({ ...asset, id: state.responseAssetId ?? id })
        }
        assert.equal(args[1], 'repos/BleedingDev/router/releases/501')
        if (args.includes('PATCH')) {
          assert.equal(
            state.release.draft,
            true,
            'Only finalize the identified draft',
          )
          assert.equal(field('draft'), 'false')
          assert.equal(field('prerelease'), 'false')
          assert.equal(field('make_latest'), 'false')
          state.edits++
          state.release.draft = false
          state.release.prerelease = false
          state.release.name = field('name')
          state.release.body = field('body')
          state.tagSha = state.tagShaOnPublish
          state.release.immutable = state.immutableOnPublish
          if (state.corruptOnPublish) {
            state.assets.set(
              'core-package.json',
              Buffer.from('corrupted on publication'),
            )
          }
        } else {
          assert.equal(
            args.length,
            2,
            'Read only the validated exact release ID',
          )
        }
        return JSON.stringify(metadata())
      }
      assert.fail(`No tag-resolving release CLI is allowed: ${args}`)
    },
  }
  const clean = () =>
    assert.deepEqual(readdirSync(temporaryRoot), ['caller-owned.txt'])
  return { ...f, state, commands, clean }
}

test('replaces an interrupted starter asset, then leaves finalized bytes untouched', (context) => {
  const f = promotion(context)
  f.state.failAfterOneUpload = true
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Upload interrupted/,
  )
  assert.equal(f.state.assets.size, 2)
  assert.equal(
    f.state.assetMetadata.get(f.cohort.package.archive).state,
    'starter',
  )
  assert.equal(f.state.release.draft, true)
  f.clean()
  f.state.failAfterOneUpload = false
  const url = publishCoreRelease('123', f.commands)
  assert.equal(
    url,
    `https://github.com/BleedingDev/router/releases/tag/ultramodern-router-core-${sha.slice(0, 12)}`,
  )
  assert.equal(f.state.deletes, 1)
  assert.equal(f.state.release.draft, false)
  assert.equal(f.state.release.immutable, true)
  f.clean()
  publishCoreRelease('123', f.commands)
  assert.equal(f.state.creates, 1)
  assert.equal(f.state.uploads, 2)
  assert.equal(f.state.edits, 1)
  assert.equal(f.state.deletes, 1)
  f.state.assets.set('core-package.json', Buffer.from('different remote bytes'))
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Never replace release bytes/,
  )
  assert.equal(f.state.deletes, 1)
  f.clean()
})

test('a newer accepted attempt replaces only differing draft bytes and interrupted uploads', (context) => {
  const f = promotion(context)
  f.state.failAfterOneUpload = true
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Upload interrupted/,
  )
  f.cohort.runAttempt = '2'
  f.save()
  f.state.jobs.at(-1).run_attempt = 2
  f.state.failAfterOneUpload = false
  publishCoreRelease('123', f.commands)
  assert.equal(f.state.deletes, 2)
  assert.equal(f.state.uploads, 3)
  assert.deepEqual(
    f.state.assets.get('core-package.json'),
    readFileSync(path.join(f.accepted, 'core-package.json')),
  )
  assert.deepEqual(
    f.state.assets.get(f.cohort.package.archive),
    readFileSync(path.join(f.accepted, f.cohort.package.archive)),
  )
  f.clean()
})

test('uploaded draft transport failures do not delete or replace assets', (context) => {
  const f = promotion(context)
  f.state.failAfterOneUpload = true
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Upload interrupted/,
  )
  f.state.failAfterOneUpload = false
  f.state.failAssetDownload = true
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Asset transport failure/,
  )
  assert.equal(f.state.deletes, 0)
  assert.equal(f.state.uploads, 1)
  assert.equal(f.state.edits, 0)
  f.clean()
})

test('publication readback rejects a moved tag, mutable release or differing bytes', (context) => {
  for (const [field, value, message] of [
    ['tagShaOnPublish', 'b'.repeat(40), /Release tag differs/],
    ['immutableOnPublish', false, /must be immutable/],
    ['corruptOnPublish', true, /Never replace release bytes/],
  ]) {
    const f = promotion(context)
    f.state[field] = value
    assert.throws(() => publishCoreRelease('123', f.commands), message)
    assert.equal(f.state.edits, 1)
    assert.equal(f.state.deletes, 0)
    f.clean()
  }
})

test('published fast return also requires immutable status without mutation', (context) => {
  const f = promotion(context)
  publishCoreRelease('123', f.commands)
  f.state.release.immutable = false
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /must be immutable/,
  )
  assert.equal(f.state.edits, 1)
  assert.equal(f.state.uploads, 2)
  assert.equal(f.state.deletes, 0)
  f.clean()
})

test('early download failure cleans only owned files; ancestry and tag mismatch cannot publish', (context) => {
  const f = promotion(context)
  f.state.failDownload = true
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Download interrupted/,
  )
  f.clean()
  f.state.failDownload = false
  f.state.ancestryFailure = true
  assert.throws(() => publishCoreRelease('123', f.commands), /Not an ancestor/)
  f.clean()
  f.state.ancestryFailure = false
  f.state.tagSha = 'b'.repeat(40)
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Release tag differs/,
  )
  assert.equal(f.state.creates, 0)
  f.clean()
})

test('published releases reject incomplete or unexpected assets without mutation', (context) => {
  const f = promotion(context)
  publishCoreRelease('123', f.commands)
  const archive = f.cohort.package.archive
  const accepted = f.state.assets.get(archive)
  f.state.assets.delete(archive)
  assert.throws(() => publishCoreRelease('123', f.commands), /incomplete/)
  f.state.assets.set(archive, accepted)
  f.state.assets.set('unaccepted.txt', Buffer.from('foreign'))
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Unexpected release asset/,
  )
  assert.equal(f.state.edits, 1)
  assert.equal(f.state.uploads, 2)
  f.clean()
})

test('an archive attributed to another source fails before any release mutation', (context) => {
  const f = promotion(context)
  f.cohort.sourceSha = 'b'.repeat(40)
  f.save()
  assert.throws(() => publishCoreRelease('123', f.commands))
  assert.equal(f.state.creates, 0)
  assert.equal(f.state.uploads, 0)
  assert.equal(f.state.edits, 0)
  f.clean()
})

test('promotion uses contents-scoped APIs and never needs Administration or GraphQL draft lookup', (context) => {
  const f = promotion(context)
  const gh = f.commands.gh
  f.commands.gh = (...args) => {
    assert(!args.some((argument) => argument.includes('immutable-releases')))
    assert(!args.includes('graphql'))
    return gh(...args)
  }
  publishCoreRelease('123', f.commands)
  assert.equal(f.state.release.immutable, true)
  f.clean()
})

test('paginated REST draft lookup rejects duplicate exact tags without mutating them', (context) => {
  const f = promotion(context)
  f.state.failAfterOneUpload = true
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Upload interrupted/,
  )
  assert.equal(f.state.release.draft, true)
  f.state.failAfterOneUpload = false
  f.state.duplicateReleaseListing = true
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Multiple releases/,
  )
  assert.equal(f.state.creates, 1)
  assert.equal(f.state.edits, 0)
  assert.equal(f.state.deletes, 0)
  f.clean()
})

test('successful PR and wrong producer or artifact provenance cannot promote', (context) => {
  for (const changes of [{ event: 'pull_request' }, { workflow_id: 999 }]) {
    const f = promotion(context)
    f.state.runChanges = changes
    assert.throws(() => publishCoreRelease('123', f.commands))
    assert.equal(f.state.creates, 0)
    f.clean()
  }
  for (const changes of [
    { expired: true },
    { digest: 'sha256:' + '0'.repeat(64) },
    { workflow_run: { id: 999 } },
    { name: 'router-core-cohort-123-1' },
  ]) {
    const f = promotion(context)
    f.state.artifactChanges = changes
    assert.throws(() => publishCoreRelease('123', f.commands))
    assert.equal(f.state.creates, 0)
    f.clean()
  }
})

test('PR-candidate contract and altered package checks reject before release mutation', (context) => {
  for (const change of ['contract', 'packageChecks']) {
    const f = promotion(context)
    if (change === 'contract') {
      f.cohort.contract = 'router-core-ci-candidate-v1'
    } else {
      f.cohort.qualification.packageChecks = []
    }
    f.save()
    assert.throws(() => publishCoreRelease('123', f.commands))
    assert.equal(f.state.creates, 0)
    f.clean()
  }
})

test('release and asset REST responses must preserve the requested IDs', (context) => {
  const wrongRelease = promotion(context)
  wrongRelease.state.failAfterOneUpload = true
  assert.throws(
    () => publishCoreRelease('123', wrongRelease.commands),
    /Upload interrupted/,
  )
  wrongRelease.state.failAfterOneUpload = false
  wrongRelease.state.responseReleaseId = 502
  assert.throws(
    () => publishCoreRelease('123', wrongRelease.commands),
    /Release response differs from requested ID/,
  )
  assert.equal(wrongRelease.state.uploads, 1)
  assert.equal(wrongRelease.state.deletes, 0)
  assert.equal(wrongRelease.state.edits, 0)
  wrongRelease.clean()

  const wrongAsset = promotion(context)
  wrongAsset.state.responseAssetId = 999
  assert.throws(
    () => publishCoreRelease('123', wrongAsset.commands),
    /Asset URL differs from its validated ID/,
  )
  assert.equal(wrongAsset.state.edits, 0)
  wrongAsset.clean()
})

test('asset download preserves binary bytes and refuses text transport', (context) => {
  const f = promotion(context)
  f.state.returnAssetText = true
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Asset transport must preserve exact binary bytes/,
  )
  assert.equal(f.state.edits, 0)
  f.clean()
})

test('retained drafts finalize with expected title, body and non-prerelease metadata', (context) => {
  const f = promotion(context)
  f.state.failAfterOneUpload = true
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /Upload interrupted/,
  )
  f.state.failAfterOneUpload = false
  f.state.release.name = 'foreign title'
  f.state.release.body = 'foreign notes'
  f.state.release.prerelease = true
  publishCoreRelease('123', f.commands)
  assert.equal(
    f.state.release.name,
    `UltraModern router-core ${sha.slice(0, 12)}`,
  )
  assert.equal(
    f.state.release.body,
    `Exact router-core archive accepted by ${run.html_url}. Source: ${sha}.`,
  )
  assert.equal(f.state.release.prerelease, false)
  f.state.release.prerelease = true
  assert.throws(
    () => publishCoreRelease('123', f.commands),
    /must not be a prerelease/,
  )
  assert.equal(f.state.edits, 1)
  f.clean()
})
