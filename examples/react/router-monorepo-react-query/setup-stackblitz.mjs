import { writeFileSync } from 'fs';

function isRunningOnStackBlitz() {
  // While it's not perfect, this is the best way to detect if we're running on StackBlitz
  return process.env.SHELL === '/bin/jsh';
}

if (isRunningOnStackBlitz()) {
  const pnpmWorkspaceContent = `packages:
  - 'packages/*'`

  writeFileSync('./pnpm-workspace.yaml', pnpmWorkspaceContent, { encoding: 'utf-8' })
}
