import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const checks = [
  {
    marker: 'data-loader',
    document: 'data',
    source: '03-data/src/routes/index.tsx',
  },
  {
    marker: 'private-loader',
    document: 'authentication',
    source: '05-authentication/src/routes/dashboard.tsx',
  },
]
const normalize = (text) =>
  text
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
for (const check of checks) {
  const doc = await readFile(
    new URL(
      `../../../../docs/start/framework/react/tutorial/learn-start/${check.document}.md`,
      import.meta.url,
    ),
    'utf8',
  )
  const source = await readFile(
    new URL(`../checkpoints/${check.source}`, import.meta.url),
    'utf8',
  )
  const pattern = new RegExp(
    '<!-- tested-source: ' + check.marker + ' -->\\s*```tsx\\n([\\s\\S]*?)```',
  )
  const match = doc.match(pattern)
  assert.ok(match, `Missing checked snippet: ${check.marker}`)
  assert.ok(
    normalize(source).includes(normalize(match[1])),
    `Documentation snippet ${check.marker} differs from ${check.source}`,
  )
}
console.log(
  `Checked ${checks.length} documentation snippets against runnable source`,
)
