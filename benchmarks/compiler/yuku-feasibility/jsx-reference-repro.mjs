import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const dependencyRoot = process.argv[2]
assert(
  dependencyRoot,
  'Usage: node jsx-reference-repro.mjs /path/to/dependency-install',
)
const require = createRequire(
  path.join(path.resolve(dependencyRoot), 'package.json'),
)
const { analyze } = await import(
  pathToFileURL(require.resolve('yuku-analyzer'))
)
const failures = []
for (const name of ['Widget', '_Widget', '$Widget', 'ÉWidget', 'éWidget']) {
  for (const [tag, expected] of [
    [`<${name} />`, 1],
    [`<${name}></${name}>`, 2],
    [`<${name}.Child />`, 1],
  ]) {
    const module = analyze(
      `const ${name} = () => null; export const render = () => ${tag};`,
      { path: 'input.tsx' },
    )
    const symbol = module.rootScope.find(name)
    const actual = symbol.references.length
    if (actual !== expected) {
      failures.push({ tag, expected, actual })
    }
  }
}
for (const tag of [
  '<widget />',
  '<widget></widget>',
  '<widget-card />',
  '<Widget-card />',
  '<svg:path />',
]) {
  const module = analyze(`export const render = () => ${tag};`, {
    path: 'input.tsx',
  })
  if (module.unresolvedReferences.length !== 0) {
    failures.push({
      tag,
      expected: 0,
      actual: module.unresolvedReferences.length,
    })
  }
}
const member = analyze(
  'const widget = {}; export const render = () => <widget.Child />;',
  {
    path: 'input.tsx',
  },
)
assert.equal(member.rootScope.find('widget').references.length, 1)
console.log(JSON.stringify({ failures }, null, 2))
assert.deepEqual(
  failures,
  [],
  'Every non-intrinsic JSX tag must record its binding references',
)
