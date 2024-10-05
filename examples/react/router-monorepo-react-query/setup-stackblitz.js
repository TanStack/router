import { writeFileSync } from 'fs'; 

const pnpmWorkspaceContent = `
packages:
  - 'packages/*'
`

writeFileSync('./pnpm-workspace.yaml', pnpmWorkspaceContent, { encoding: 'utf-8' })


