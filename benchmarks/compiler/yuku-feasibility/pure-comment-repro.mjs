import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Point at a scratch install so the experiment does not alter workspace deps.
const dependencyRoot = process.argv[2]
assert(
  dependencyRoot,
  'Usage: node pure-comment-repro.mjs /path/to/scratch-install',
)
const require = createRequire(
  path.join(path.resolve(dependencyRoot), 'package.json'),
)
const { parse } = await import(pathToFileURL(require.resolve('yuku-parser')))
const { generate } = await import(
  pathToFileURL(require.resolve('yuku-codegen'))
)
const source = 'const value = /* @__PURE__ */ factory();'
const { program } = parse(source, { attachComments: true })
const { code } = generate(program)
console.log(JSON.stringify({ source, actual: code }, null, 2))
assert.match(
  code,
  /@__PURE__/,
  'The default comment policy must preserve purity annotations',
)
