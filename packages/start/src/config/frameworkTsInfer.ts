import fs from 'node:fs'
import path from 'node:path'

export const TANSTACK_FOLDER_NAME = '.tanstack'
export const TANSTACK_START_DTS_FILENAME = 'tanstack-start.d.ts'

const INTERNAL_START_TYPES_FILENAME = 'start-types.d.ts'

const TANSTACK_START_DTS_TEMPLATE = `/// <reference types="../.tanstack/${INTERNAL_START_TYPES_FILENAME}" />\n`

export function fillFrameworkTsInfer(opts: {
  root: string
  appDirectory: string
}) {
  const tanstackFolder = path.join(opts.root, TANSTACK_FOLDER_NAME)
  const frameworkDTSPath = path.join(
    opts.appDirectory,
    TANSTACK_START_DTS_FILENAME,
  )

  if (!fs.existsSync(tanstackFolder)) {
    fs.mkdirSync(tanstackFolder)
  }

  const internalRootExport = path.join(
    tanstackFolder,
    INTERNAL_START_TYPES_FILENAME,
  )
  if (!fs.existsSync(internalRootExport)) {
    fs.writeFileSync(internalRootExport, '', { encoding: 'utf-8' })
  }

  const frameworkDTSExists = fs.existsSync(frameworkDTSPath)
  if (!frameworkDTSExists) {
    fs.writeFileSync(frameworkDTSPath, TANSTACK_START_DTS_TEMPLATE, {
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

  const gitIgnoreContent = fs.readFileSync(gitIgnorePath, { encoding: 'utf-8' })

  if (!gitIgnoreContent.includes(TANSTACK_FOLDER_NAME)) {
    fs.appendFileSync(gitIgnorePath, `${TANSTACK_FOLDER_NAME}\n`, {
      encoding: 'utf-8',
    })
  }
}
