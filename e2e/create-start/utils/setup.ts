import { exec, execSync } from 'node:child_process'
import { test as baseTest } from '@playwright/test'
import terminate from 'terminate/promise'
import waitPort from 'wait-port'

async function _setup(
  projectPath: string,
  port: number,
): Promise<{
  PID: number
  ADDR: string
  killProcess: () => Promise<void>
  deleteTempDir: () => void
}> {
  const ADDR = `http://localhost:${port}`

  const childProcess = exec(
    `VITE_SERVER_PORT=${port} pnpm vite dev --port ${port}`,
    {
      cwd: projectPath,
    },
  )

  childProcess.stdout?.on('data', (data) => {
    const message = data.toString()
    console.log('Stdout:', message)
  })

  childProcess.stderr?.on('data', (data) => {
    console.error('Stderr:', data.toString())
  })

  try {
    await waitPort({ port, timeout: 30000 }) // Added timeout
  } catch (err) {
    console.error('Failed to start server:', err)
    throw err
  }

  const PID = childProcess.pid!
  const killProcess = async () => {
    console.log('Killing process')
    try {
      await terminate(PID)
    } catch (err) {
      console.error('Failed to kill process:', err)
    }
  }
  const deleteTempDir = () => execSync(`rm -rf ${projectPath}`)

  return { PID, ADDR, killProcess, deleteTempDir }
}

type SetupApp = Awaited<ReturnType<typeof _setup>>

export const test = baseTest.extend<{
  setupApp: SetupApp
  projectPath: string
  port: number
  ensureServer: void
}>({
  projectPath: ['', { option: true }],
  port: [0, { option: true }],
  ensureServer: [
    async ({ projectPath, port }, use) => {
      const setup = await _setup(projectPath, port)
      await use()
      await setup.killProcess()
    },
    { auto: true },
  ],
})
