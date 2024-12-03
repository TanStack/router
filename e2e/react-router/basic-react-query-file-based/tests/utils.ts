import { exec } from 'node:child_process'
import { test as baseTest } from '@playwright/test'
import { getRandomPort } from 'get-port-please'
import terminate from 'terminate/promise'
import waitPort from 'wait-port'

async function _setup(): Promise<{
  PORT: number
  PID: number
  ADDR: string
  killProcess: () => Promise<void>
}> {
  const PORT = await getRandomPort()
  const ADDR = `http://localhost:${PORT}`

  const childProcess = exec(
    `VITE_SERVER_PORT=${PORT} pnpm run dev:e2e --port ${PORT}`,
  )
  childProcess.stdout?.on('data', (data) => {
    const message = data.toString()
    console.log('Stdout:', message)
  })
  await waitPort({ port: PORT })

  const PID = childProcess.pid!
  const killProcess = () => terminate(PID)

  return { PORT, PID, ADDR, killProcess }
}

type SetupApp = Awaited<ReturnType<typeof _setup>>

export const test = baseTest.extend<{ setupApp: SetupApp }>({
  // don't know why playwright wants this fist argument to be destructured
  // eslint-disable-next-line unused-imports/no-unused-vars
  setupApp: async ({ page }, use) => {
    const setup = await _setup()
    await use(setup)
  },
})
