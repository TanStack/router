import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('readiness checks PostgreSQL and public pages render on direct requests', async ({
  request,
  baseURL,
}) => {
  const health = await request.get('/healthz')
  expect(health.status()).toBe(200)
  expect(health.headers()['cache-control']).toBe('no-store')
  expect(await health.text()).toBe('ok')
  const home = await request.get('/')
  expect(home.status()).toBe(200)
  expect(await home.text()).toContain('Field notes')
  const note = await request.get('/notes/first-route')
  expect(note.status()).toBe(200)
  expect(await note.text()).toContain(`${baseURL}/notes/first-route`)
  expect((await request.get('/notes/deployment-missing-note')).status()).toBe(
    404,
  )
})

test('production artifact has no public secrets and reports database failure', async () => {
  test.skip(
    process.env.COURSE_PRODUCTION !== '1',
    'Requires the production artifact',
  )
  const output = new URL(
    '../checkpoints/07-deployment/.output/',
    import.meta.url,
  )
  const publicDir = new URL('public/', output)
  const entries = await readdir(publicDir, {
    recursive: true,
    withFileTypes: true,
  })
  const assets = entries.filter((entry) => entry.isFile())
  expect(assets.length).toBeGreaterThan(0)
  const databaseUrl = process.env.AUTH_DATABASE_URL
  const secret = process.env.BETTER_AUTH_SECRET
  if (!databaseUrl || !secret) {
    throw new Error('Set AUTH_DATABASE_URL and BETTER_AUTH_SECRET')
  }
  const password = decodeURIComponent(new URL(databaseUrl).password)
  for (const asset of assets) {
    const content = await readFile(join(asset.parentPath, asset.name), 'utf8')
    expect(content).not.toContain(databaseUrl)
    expect(content).not.toContain(secret)
    if (password) {
      expect(content).not.toContain(password)
    }
  }
  const directory = await mkdtemp(join(tmpdir(), 'learn-start-deployment-'))
  const unavailableDatabase = new URL(databaseUrl)
  unavailableDatabase.hostname = '127.0.0.1'
  unavailableDatabase.port = '1'
  try {
    await cp(output, join(directory, 'output'), { recursive: true })
    const server = spawn(process.execPath, ['output/server/index.mjs'], {
      cwd: directory,
      env: {
        ...process.env,
        AUTH_DATABASE_URL: unavailableDatabase.href,
        APP_ORIGIN: 'http://localhost:3148',
        PORT: '3148',
      },
      stdio: 'ignore',
    })
    try {
      await expect
        .poll(
          async () => {
            try {
              const response = await fetch('http://localhost:3148/healthz')
              return { status: response.status, body: await response.text() }
            } catch {
              return null
            }
          },
          { timeout: 20_000 },
        )
        .toEqual({ status: 503, body: 'unavailable' })
    } finally {
      if (server.exitCode === null && server.signalCode === null) {
        const exited = once(server, 'exit')
        server.kill('SIGTERM')
        await exited
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
