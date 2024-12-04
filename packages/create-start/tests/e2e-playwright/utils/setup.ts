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
}> {
  const ADDR = `http://localhost:${port}`

  const childProcess = exec(
    `VITE_SERVER_PORT=${port} pnpm vinxi dev --port ${port}`,
    {
      cwd: projectPath,
    },
  )

  childProcess.stdout?.on('data', (data) => {
    const message = data.toString()
    console.log('Stdout:', message)
  })
  await waitPort({ port: port })

  const PID = childProcess.pid!
  const killProcess = () => terminate(PID)

  return { PID, ADDR, killProcess }
}

type SetupApp = Awaited<ReturnType<typeof _setup>>

export const test = baseTest.extend<{
  setupApp: SetupApp
  projectPath: string
  port: number
}>({
  projectPath: ['', { option: true }],
  port: [0, { option: true }],
  // don't know why playwright wants this fist argument to be destructured
  // eslint-disable-next-line unused-imports/no-unused-vars
  setupApp: async ({ page, projectPath, port }, use, testInfo) => {
    const setup = await _setup(projectPath, port)
    await use(setup)

    execSync(`rm -rf ${projectPath}`)
  },
})
