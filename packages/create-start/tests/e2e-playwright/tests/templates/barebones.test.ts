import { test } from '../../utils/setup'
import { barebonesTemplate } from '../../../../src/templates/barebones'
import { temporaryDirectory } from 'tempy'
import { getRandomPort } from 'get-port-please'

// Before running any tests - create the project in the temporary directory
const projectPath = temporaryDirectory()
await barebonesTemplate._execute({
  cfg: {
    name: 'test-project',
    packageManager: 'bun',
    installDeps: true,
    setupGit: false,
    ide: 'vscode',
  },
  targetPath: projectPath,
  type: 'new-project',
})
test.use({ projectPath })

const PORT = await getRandomPort()
test.use({ port: PORT })
test.use({ baseURL: `http://localhost:${PORT}` })
test.afterEach(async ({ setupApp: setup }) => {
  await setup.killProcess()
})

test.describe('barebones template e2e', () => {
  test('Navigating to post', async ({ page, setupApp }) => {
    await page.goto('/')
  })
})
