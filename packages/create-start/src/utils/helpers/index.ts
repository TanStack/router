import path, { resolve } from 'node:path'
import fs, {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import invariant from 'tiny-invariant'
import fastGlob from 'fast-glob'
import { createDebugger } from '../debug'

import { helperFactory } from './helperFactory'
import type { Ctx } from './helperFactory'

const debug = createDebugger('helpers')

export const initHelpers = (modulePath: string, targetPath: string) => {
  debug.info('Initializing helpers', { modulePath, targetPath })

  const getFullModulePath = (relativePath: string) => {
    const fullPath = path.join(modulePath, relativePath)
    debug.trace('Getting full module path', { relativePath, fullPath })
    return fullPath
  }

  const getFullTargetPath = (relativePath: string) => {
    const fullPath = path.join(targetPath, relativePath)
    debug.trace('Getting full target path', { relativePath, fullPath })
    return fullPath
  }

  const targetFileExists = async (relativePath: string) => {
    const path = resolve(targetPath, relativePath)
    debug.trace('Checking if target file exists', { path })
    return await checkFileExists(path)
  }

  const moduleFileExists = async (relativePath: string) => {
    const path = resolve(modulePath, relativePath)
    debug.trace('Checking if module file exists', { path })
    return await checkFileExists(path)
  }

  const ctx: Ctx = {
    targetFileExists,
    moduleFileExists,
    absoluteModuleFolder: getFullModulePath(modulePath),
    absoluteTargetFolder: getFullTargetPath(targetPath),
    getFullModulePath,
    getFullTargetPath,
  }

  debug.verbose('Created helper context', ctx)

  return {
    ...ctx,
    readTargetFile: createReadTargetFile({
      ctx,
      modulePath,
      targetPath,
    }),
    writeTargetfile: createWriteTargetFile({
      ctx,
      modulePath,
      targetPath,
    }),
    copyTemplateFiles: createCopyTemplateFiles({
      ctx,
      modulePath,
      targetPath,
    }),
    getTemplateFilesThatWouldBeOverwritten:
      createGetTemplateFilesThatWouldBeOverwritten({
        ctx,
        modulePath,
        targetPath,
      }),
  }
}

export const checkFileExists = async (path: string): Promise<boolean> => {
  debug.trace('Checking if file exists', { path })
  try {
    await access(path, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

export const checkFolderExists = async (path: string): Promise<boolean> => {
  debug.trace('Checking if folder exists', { path })
  try {
    await access(path, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

export const checkFolderIsEmpty = async (path: string): Promise<boolean> => {
  debug.trace('Checking if folder is empty', { path })
  try {
    const files = await readdir(path)
    return files.length === 0
  } catch {
    return false
  }
}

const createReadTargetFile = helperFactory(
  ({ ctx, targetPath }) =>
    async (relativePath: string) => {
      debug.trace('Reading target file', { relativePath, targetPath })
      invariant(
        await ctx.targetFileExists(relativePath),
        `The file ${relativePath} doesn't exist`,
      )
      const path = resolve(targetPath, relativePath)
      return await readFile(path, 'utf-8')
    },
)

export const createWriteTargetFile = helperFactory(
  ({ targetPath }) =>
    async (
      relativePath: string,
      content: string,
      overwrite: boolean = false,
    ) => {
      debug.trace('Writing target file', {
        relativePath,
        targetPath,
        overwrite,
      })
      const path = resolve(targetPath, relativePath)
      invariant(
        !(!overwrite && (await checkFileExists(path))),
        `File ${relativePath} already exists and overwrite is false`,
      )
      await writeFile(path, content)
    },
)

const DOT_PREFIX = '_dot_'

const removeTsNoCheckHeader = async (filePath: string) => {
  debug.trace('Removing ts-nocheck header', { filePath })
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
  debug.trace('Copying directory', { srcDir, destDir })
  await mkdir(destDir, { recursive: true })
  const files = await readdir(srcDir)
  for (const file of files) {
    const srcFile = resolve(srcDir, file)
    const destFile = resolve(destDir, file)
    await copy(srcFile, destFile)
  }
}

async function copy(src: string, dest: string) {
  debug.trace('Copying file', { src, dest })
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
  ({ ctx }) =>
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
      debug.verbose('Checking for files that would be overwritten', {
        file,
        templateFolder,
        targetFolder,
        overwrite,
      })
      const overwrittenFiles: Array<string> = []

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
          debug.verbose('Found file that would be overwritten', { file })
          overwrittenFiles.push(file)
        }
      }

      return overwrittenFiles
    },
)

export const createCopyTemplateFiles = helperFactory(
  ({ ctx }) =>
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
      debug.verbose('Copying template files', {
        file,
        templateFolder,
        targetFolder,
        overwrite,
      })
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

        debug.trace('Copying template file', { file })
        await copy(
          resolve(absoluteTemplateFolder, file),
          resolve(absoluteTargetFolder, file),
        )
      }
    },
)
