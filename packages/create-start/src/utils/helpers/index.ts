import path, { resolve } from 'node:path'
import {
  createCopyTemplateFiles,
  createGetTemplateFilesThatWouldBeOverwritten,
} from './copyTemplateFiles'
import { checkFileExists } from './base-utils'
import { createReadTargetFile } from './readTargetFile'
import { createWriteTargetFile } from './writeTargetFile'
import type { Ctx } from './helperFactory'

export const initHelpers = (modulePath: string, targetPath: string) => {
  const getFullModulePath = (relativePath: string) => {
    return path.join(modulePath, relativePath)
  }

  const getFullTargetPath = (relativePath: string) => {
    return path.join(targetPath, relativePath)
  }

  const targetFileExists = async (relativePath: string) => {
    const path = resolve(targetPath, relativePath)
    return await checkFileExists(path)
  }

  const moduleFileExists = async (relativePath: string) => {
    const path = resolve(modulePath, relativePath)
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
