import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const repo = process.env.GITHUB_WORKSPACE
const binary = path.join(repo, '.native-artifact/binary/bun')
const proof = path.join(repo, '.native-browser-proof')
const cache = path.join(repo, 'packages/router-plugin/.cache/native-validation')
const preload = path.join(cache, 'preload.ts')
const upstream = path.join(repo, '.native-unplugin/dist/index.mjs')
const wrapper = path.join(cache, 'bin/bun')
await mkdir(path.dirname(wrapper), { recursive: true })
await mkdir(proof, { recursive: true })
await chmod(binary, 0o755)
const hash = createHash('sha256')
  .update(await readFile(binary))
  .digest('hex')
const expected = JSON.parse(
  await readFile(path.join(repo, '.native-artifact/binary-proof.json'), 'utf8'),
)
if (hash !== expected.sha256) {
  throw new Error('Downloaded native Bun binary hash mismatch')
}
// Bun resolves this mock beside router-plugin's installed unplugin dependency.
await writeFile(
  preload,
  `import { mock } from 'bun:test'\nimport * as upstream from ${JSON.stringify(pathToFileURL(upstream).href)}\nmock.module('unplugin', () => upstream)\n`,
)
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`
await writeFile(
  wrapper,
  `#!/bin/sh\nexec ${quote(binary)} --preload ${quote(preload)} "$@"\n`,
)
await chmod(wrapper, 0o755)
const versions = {
  routerHead: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim(),
  unpluginHead: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: path.dirname(path.dirname(upstream)),
    encoding: 'utf8',
  }).trim(),
  node: process.version,
  bun: execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim(),
  binarySha256: hash,
  nativeSource: expected,
}
await writeFile(
  path.join(proof, 'versions.json'),
  JSON.stringify(versions, null, 2) + '\n',
)
await writeFile(path.join(proof, 'preload.ts'), await readFile(preload))
await writeFile(
  process.env.GITHUB_ENV,
  `BUN_EXECUTABLE=${binary}\nBUN_PLUGIN_PRELOAD=${preload}\nBUN_DEV_TEST_OUTPUT=${proof}/dev-results\n`,
  { flag: 'a' },
)
await writeFile(process.env.GITHUB_PATH, path.dirname(wrapper) + '\n', {
  flag: 'a',
})
console.log(JSON.stringify(versions, null, 2))
