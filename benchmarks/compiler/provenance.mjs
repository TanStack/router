import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// Hash the executable compiler outputs actually consumed by workspace imports.
export function compilerFingerprint(workspace) {
  const hash = createHash('sha256')
  const sourceHash = createHash('sha256')
  let files = 0
  let sourceFiles = 0
  for (const name of [
    'router-utils',
    'router-generator',
    'router-plugin',
    'start-plugin-core',
  ]) {
    const sourceDirectory = path.join(workspace, 'packages', name, 'src')
    for (const file of readdirSync(sourceDirectory, { recursive: true })
      .sort()
      .filter((entry) => /\.[cm]?[jt]sx?$/.test(entry))) {
      sourceHash
        .update(`${name}/${file}\0`)
        .update(readFileSync(path.join(sourceDirectory, file)))
        .update('\0')
      sourceFiles++
    }
    sourceHash
      .update(`${name}/package.json\0`)
      .update(
        readFileSync(path.join(workspace, 'packages', name, 'package.json')),
      )
      .update('\0')
    const directory = path.join(workspace, 'packages', name, 'dist/esm')
    let entries
    try {
      entries = readdirSync(directory, { recursive: true })
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      hash.update(`${name}:not-built`)
      continue
    }
    for (const file of entries
      .sort()
      .filter((entry) => entry.endsWith('.js'))) {
      hash
        .update(`${name}/${file}\0`)
        .update(readFileSync(path.join(directory, file)))
        .update('\0')
      files++
    }
  }
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspace,
    encoding: 'utf8',
  })
  if (revision.status !== 0) {
    throw new Error(revision.stderr)
  }
  const dependencyVersions = {}
  for (const name of [
    'yuku-analyzer',
    'yuku-ast',
    'yuku-codegen',
    '@yuku-toolchain/types',
    '@babel/core',
    '@babel/generator',
    '@babel/types',
  ]) {
    try {
      dependencyVersions[name] = JSON.parse(
        readFileSync(
          path.join(
            workspace,
            'packages/router-utils/node_modules',
            name,
            'package.json',
          ),
          'utf8',
        ),
      ).version
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }
  return {
    commit: revision.stdout.trim(),
    sha256: hash.digest('hex'),
    javascriptFiles: files,
    sourceSha256: sourceHash.digest('hex'),
    sourceFiles,
    dependencyVersions,
  }
}
