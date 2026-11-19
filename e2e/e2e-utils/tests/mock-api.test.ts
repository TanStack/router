import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const execFileAsync = promisify(execFile)
const preload = fileURLToPath(new URL('../mock-api.mjs', import.meta.url))
// Disable networking by failing DNS resolution: MSW connects mocked sockets
// with its own lookup, so only requests that reach the network resolve hosts.
const disableNetwork = `data:text/javascript,${encodeURIComponent(`
  import dns from 'node:dns'
  globalThis.networkConnections = 0
  dns.lookup = (hostname, options, callback) => {
    globalThis.networkConnections++
    ;(callback ?? options)(new Error('Network disabled'))
  }
`)}`
const nodeArgs = (script: string) => [
  '--import',
  disableNetwork,
  '--import',
  preload,
  '--eval',
  script,
]

test('independent Node processes mock the API with networking disabled', async () => {
  const script = `
    const posts = await fetch('https://jsonplaceholder.typicode.com/posts').then(r => r.json())
    const user = await fetch('https://jsonplaceholder.typicode.com/users/1').then(r => r.json())
    const invalid = await fetch('https://jsonplaceholder.typicode.com/posts/invalid')
    const missing = await fetch('https://jsonplaceholder.typicode.com/posts/999')
    console.log(JSON.stringify({ post: posts[0].id, user: user.id, invalid: invalid.status, missing: await missing.text() }))
  `
  const results = await Promise.all(
    [0, 1].map(() => execFileAsync(process.execPath, nodeArgs(script))),
  )
  for (const result of results) {
    expect(JSON.parse(result.stdout)).toEqual({
      post: 1,
      user: 1,
      invalid: 404,
      missing: '',
    })
  }
})

test('unhandled API requests fail without reaching the network', async () => {
  const script = `
    try {
      await fetch('https://jsonplaceholder.typicode.com/unhandled')
      process.exitCode = 1
    } catch {
      console.log(JSON.stringify({ connections: globalThis.networkConnections }))
    }
  `
  const result = await execFileAsync(process.execPath, nodeArgs(script))
  expect(JSON.parse(result.stdout)).toEqual({ connections: 0 })
})
