import fs from 'node:fs'
import path from 'node:path'

export const TANSTACK_DIR_NAME = '.tanstack'
export const PUBLIC_TANSTACK_START_DTS_FILENAME = 'tanstack-start.d.ts'

export const INTERNAL_START_TYPES_FILENAME = 'start-types.d.ts'

const TANSTACK_START_DTS_TEMPLATE = `/// <reference path="../.tanstack/${INTERNAL_START_TYPES_FILENAME}" />`

export function setupFrameworkTypesFile(opts: {
  root: string
  appDirectory: string
}) {
  const tanstackDir = path.join(opts.root, TANSTACK_DIR_NAME)
  const frameworkDTSPath = path.join(
    opts.appDirectory,
    PUBLIC_TANSTACK_START_DTS_FILENAME,
  )

  // Create the .tanstack directory if it doesn't exist
  if (!fs.existsSync(tanstackDir)) {
    fs.mkdirSync(tanstackDir)
  }

  // Create the internal .tanstack/start-types.d.ts file if it doesn't exist
  const internalRootExport = path.join(
    tanstackDir,
    INTERNAL_START_TYPES_FILENAME,
  )
  if (!fs.existsSync(internalRootExport)) {
    fs.writeFileSync(internalRootExport, '', { encoding: 'utf-8' })
  }

  // Create the tanstack-start.d.ts file if it doesn't exist
  const frameworkDTSExists = fs.existsSync(frameworkDTSPath)
  if (!frameworkDTSExists) {
    fs.writeFileSync(frameworkDTSPath, `${TANSTACK_START_DTS_TEMPLATE}\n`, {
      encoding: 'utf-8',
    })
  }

  handleGitIgnore({ root: opts.root })
}

function handleGitIgnore({ root }: { root: string }) {
  const gitIgnorePath = path.join(root, '.gitignore')
  if (!fs.existsSync(gitIgnorePath)) {
    return
  }

  const gitIgnoreLines = fs
    .readFileSync(gitIgnorePath, { encoding: 'utf-8' })
    .split('\n')

  // Check if the .tanstack directory is already in the .gitignore file
  const tanstackFolderIndex = gitIgnoreLines.some((line) =>
    line.includes(TANSTACK_DIR_NAME),
  )

  // If the .tanstack folder is already in the .gitignore file, return
  if (tanstackFolderIndex) {
    return
  }

  // Add the .tanstack directory to the .gitignore file
  fs.appendFileSync(gitIgnorePath, `${TANSTACK_DIR_NAME}\n`, {
    encoding: 'utf-8',
  })
}
