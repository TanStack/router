import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import fastGlob from 'fast-glob'
import { TEMPLATES_FOLDER } from '../constants'

/**
 * all files prefixed with `_dot_` will be copied over to the created project with a `.` instead of the `_dot_`
 */
const DOT_PREFIX = '_dot_'

interface CopyTemplateFilesParams {
  file: string
  sourceFolder: string
  targetFolder: string
}
export async function copyTemplateFiles({
  file,
  sourceFolder,
  targetFolder,
}: CopyTemplateFilesParams) {
  const files = await fastGlob.glob(file, {
    cwd: resolve(TEMPLATES_FOLDER, sourceFolder),
    onlyFiles: false,
  })

  for (const file of files) {
    await copy(
      resolve(TEMPLATES_FOLDER, sourceFolder, file),
      resolve(targetFolder, file),
    )
  }
}

async function copyDir(srcDir: string, destDir: string) {
  await mkdir(destDir, { recursive: true })
  const files = await readdir(srcDir)
  for (const file of files) {
    const srcFile = resolve(srcDir, file)
    const destFile = resolve(destDir, file)
    await copy(srcFile, destFile)
  }
}

async function copy(src: string, dest: string) {
  const statResult = await stat(src)
  const replacedDest = dest.replace(DOT_PREFIX, '.')
  if (statResult.isDirectory()) {
    copyDir(src, replacedDest)
  } else {
    await copyFile(src, replacedDest)
  }
}
