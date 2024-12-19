import { temporaryDirectory } from 'tempy'
import { getRandomPort } from 'get-port-please'
import { unstable_scaffoldTemplate } from '@tanstack/create-start'
import { test } from '../../utils/setup'

// Before running any tests - create the project in the temporary directory
const projectPath = temporaryDirectory()
await unstable_scaffoldTemplate({
  cfg: {
    packageManager: {
      installDeps: true,
      packageManager: 'pnpm',
    },
    git: {
      setupGit: false,
    },
    packageJson: {
      type: 'new',
      name: 'barebones-test',
    },
    ide: {
      ide: 'vscode',
    },
  },
  targetPath: projectPath,
  templateId: 'barebones',
})

const PORT = await getRandomPort()
test.use({ projectPath })
test.use({ port: PORT })
test.use({ baseURL: `http://localhost:${PORT}` })

test.describe('barebones template e2e', () => {
  test('Navigating to index page', async ({ page }) => {
    await page.goto('/')
  })
})
