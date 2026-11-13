import { spawn } from 'node:child_process'
import net from 'node:net'
import { expect, test } from '@playwright/test'

// https://github.com/TanStack/router/issues/4620
// `vite dev --mode test` must serve the app through the Start dev server.
// The server is started here because the Nx modes only start built output.
test.skip(
  process.env.E2E_TOOLCHAIN !== 'vite' || process.env.MODE !== 'ssr',
  'runs once, in the vite ssr mode',
)

function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
  })
}

test('serves the app with `vite dev --mode test`', async ({ page }) => {
  const port = await getFreePort()
  const output: Array<string> = []
  const dev = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      'dev',
      '--mode',
      'test',
      '--port',
      String(port),
      '--strictPort',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  dev.stdout.on('data', (chunk) => output.push(String(chunk)))
  dev.stderr.on('data', (chunk) => output.push(String(chunk)))

  try {
    const baseURL = `http://localhost:${port}`
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(baseURL)).status
          } catch {
            return 0
          }
        },
        { timeout: 60_000, message: output.join('') },
      )
      .not.toBe(0)

    const response = await page.goto(baseURL)
    expect(response?.status()).toBe(200)
    await expect(page.getByText('Welcome Home!!!')).toBeVisible()
  } finally {
    dev.kill()
  }
})
