import { writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function isRunningOnStackBlitz() {
  // Given stackblitz is running only on a folder and not the mono, this should detect if we are running on stackblitz
  return !__dirname.includes('router/examples')
}

if (isRunningOnStackBlitz()) {
  // Create the pnpm-workspace.yaml file, since we only need it for StackBlitz
  const pnpmWorkspaceContent = `packages:
  - 'packages/*'`

  writeFileSync('./pnpm-workspace.yaml', pnpmWorkspaceContent, {
    encoding: 'utf-8',
  })

  // Then re-run pnpm install
  execSync('pnpm install', { stdio: 'inherit' })
}
