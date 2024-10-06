import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

function isRunningOnStackBlitz() {
  // While it's not perfect, this is the best way to detect if we're running on StackBlitz
  return process.env.SHELL === '/bin/jsh';
}

if (isRunningOnStackBlitz()) {
  // Create the pnpm-workspace.yaml file, since we only need it for StackBlitz
  const pnpmWorkspaceContent = `packages:
  - 'packages/*'`

  writeFileSync('./pnpm-workspace.yaml', pnpmWorkspaceContent, { encoding: 'utf-8' })

  // Then re-run pnpm install
  execSync('pnpm install');
}
