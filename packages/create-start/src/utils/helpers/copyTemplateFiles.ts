import invariant from 'tiny-invariant'
import { checkFileExists, checkFolderExists } from './base-utils'
import { helperFactory } from './helperFactory'
import fastGlob from 'fast-glob'
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { resolve } from 'node:path'

const DOT_PREFIX = '_dot_'

const removeTsNoCheckHeader = async (filePath: string) => {
  // Template files will sometimes include // @ts-nocheck in the header of the file
  // This is to avoid type checking in the template folders
  // This function removes that header

  const content = await readFile(filePath, 'utf-8')
  const lines = content.split('\n')

  let newContent = content

  if (lines[0]?.trim() === '// @ts-nocheck') {
    newContent = lines.slice(1).join('\n').trimStart()
  }

  await writeFile(filePath, newContent)
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
  const replacedDest = dest.replaceAll(DOT_PREFIX, '.')
  if (statResult.isDirectory()) {
    await copyDir(src, replacedDest)
  } else {
    await copyFile(src, replacedDest)
    await removeTsNoCheckHeader(replacedDest)
  }
}

export const createGetTemplateFilesThatWouldBeOverwritten = helperFactory(
  ({ ctx, modulePath, targetPath }) =>
    async ({
      file,
      templateFolder,
      targetFolder,
      overwrite,
    }: {
      file: string
      templateFolder: string
      targetFolder: string
      overwrite: boolean
    }) => {
      const overwrittenFiles: string[] = []

      if (overwrite) []

      const absoluteTemplateFolder = ctx.getFullModulePath(templateFolder)
      const absoluteTargetFolder = ctx.getFullTargetPath(targetFolder)

      const files = await fastGlob.glob(file, {
        cwd: absoluteTemplateFolder,
        onlyFiles: false,
      })

      for (const file of files) {
        const exists = await checkFileExists(
          resolve(absoluteTargetFolder, file),
        )
        if (exists) {
          overwrittenFiles.push(file)
        }
      }

      return overwrittenFiles
    },
)

export const createCopyTemplateFiles = helperFactory(
  ({ ctx, modulePath, targetPath }) =>
    async ({
      file,
      templateFolder,
      targetFolder,
      overwrite,
    }: {
      file: string
      templateFolder: string
      targetFolder: string
      overwrite: boolean
    }) => {
      const absoluteTemplateFolder = ctx.getFullModulePath(templateFolder)
      const absoluteTargetFolder = ctx.getFullTargetPath(targetFolder)

      const templateFolderExists = checkFolderExists(absoluteTemplateFolder)
      invariant(
        templateFolderExists,
        `The template folder ${templateFolder} doesn't exist`,
      )

      const files = await fastGlob.glob(file, {
        cwd: absoluteTemplateFolder,
        onlyFiles: false,
      })

      for (const file of files) {
        if (overwrite) {
          invariant(
            await checkFileExists(resolve(absoluteTargetFolder, file)),
            `The file ${file} couldn't be created because it would overwrite an existing file`,
          )
        }

        await copy(
          resolve(absoluteTemplateFolder, file),
          resolve(absoluteTargetFolder, file),
        )
      }
    },
)
