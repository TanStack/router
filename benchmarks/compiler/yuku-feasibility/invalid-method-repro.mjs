import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Invalid-input hardening report, not a supported-AST/codegen defect.
// Run in a child because native codegen may terminate the process.
const dependencyRoot = process.argv[2]
assert(
  dependencyRoot,
  'Usage: node invalid-method-repro.mjs /path/to/dependencies',
)
if (process.argv[3] !== '--child') {
  const result = spawnSync(
    process.execPath,
    [process.argv[1], dependencyRoot, '--child'],
    { encoding: 'utf8' },
  )
  console.log(
    JSON.stringify(
      {
        status: result.status,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
      },
      null,
      2,
    ),
  )
} else {
  const require = createRequire(
    path.join(path.resolve(dependencyRoot), 'package.json'),
  )
  const { parse } = await import(pathToFileURL(require.resolve('yuku-parser')))
  const { generate } = await import(
    pathToFileURL(require.resolve('yuku-codegen'))
  )
  const { program } = parse('const route = { loader() { return 1 } };')
  // Caller mistake: method:true requires a FunctionExpression value.
  const property = program.body[0].declarations[0].init.properties[0]
  property.value = {
    type: 'CallExpression',
    start: 0,
    end: 0,
    callee: { type: 'Identifier', start: 0, end: 0, name: 'lazy' },
    arguments: [],
    optional: false,
  }
  console.log(generate(program))
}
