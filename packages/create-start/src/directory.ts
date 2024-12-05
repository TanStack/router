import path from 'node:path'
import fs from 'node:fs/promises'
import { createOption } from '@commander-js/extra-typings'
import { InvalidArgumentError, input } from '@inquirer/prompts'
import {
  checkFolderExists,
  checkFolderIsEmpty,
} from './utils/helpers/base-utils'

export const getAbsolutePath = (relativePath: string) => {
  return path.resolve(process.cwd(), relativePath)
}

const doesPathExist = async (absolutePath: string) => {
  try {
    await fs.access(absolutePath)
    return true
  } catch {
    return false
  }
}

const isFolderEmpty = async (absolutePath: string) => {
  try {
    const files = await fs.readdir(absolutePath)
    return files.length === 0
  } catch {
    return false
  }
}

const DEFAULT_NAME = 'my-tanstack-start-app'

const generateDefaultName = async () => {
  // Generate a unique default name e.g. my-tanstack-start-app,
  // my-tanstack-start-app-1, my-tanstack-start-app-2 etc

  let folderName = DEFAULT_NAME
  let absolutePath = getAbsolutePath(folderName)
  let pathExists = await doesPathExist(absolutePath)
  let counter = 1
  while (pathExists) {
    folderName = `${DEFAULT_NAME}-${counter}`
    absolutePath = getAbsolutePath(folderName)
    pathExists = await doesPathExist(absolutePath)
    counter++
  }
  return `./${folderName}`
}

export const newProjectDirectoryCliOption = createOption(
  '--directory <string>',
  'The directory to scaffold your app in',
).argParser(async (directory) => {
  const absolutePath = getAbsolutePath(directory)
  const pathExists = await doesPathExist(absolutePath)
  if (!pathExists) return directory
  const folderEmpty = await isFolderEmpty(absolutePath)
  if (folderEmpty) return directory
  throw new InvalidArgumentError(
    'The directory is not empty. New projects can only be scaffolded in empty directories',
  )
})

export const newProjectDirectoryPrompt = async () => {
  return await input({
    message: 'Where should the project be created?',
    default: await generateDefaultName(),
    validate: async (path) => {
      const targetPath = getAbsolutePath(path)
      const targetExists = await checkFolderExists(targetPath)
      const targetIsEmpty = await checkFolderIsEmpty(targetPath)

      if (targetExists && !targetIsEmpty) {
        return 'The directory is not empty. New projects can only be scaffolded in empty directories'
      }

      return true
    },
  })
}
