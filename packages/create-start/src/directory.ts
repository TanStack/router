import path from 'node:path'
import fs from 'node:fs/promises'
import { InvalidArgumentError, createOption } from '@commander-js/extra-typings'
import { input } from '@inquirer/prompts'

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

const validateDirectory = async (directory: string) => {
  const absolutePath = getAbsolutePath(directory)
  const pathExists = await doesPathExist(absolutePath)
  if (!pathExists) return true
  const folderEmpty = await isFolderEmpty(absolutePath)
  if (folderEmpty) return true
  return 'The directory is not empty. New projects can only be scaffolded in empty directories'
}

export const newProjectDirectoryCliOption = createOption(
  '--directory <string>',
  'The directory to scaffold your app in',
).argParser(async (directory) => {
  const validationResult = await validateDirectory(directory)
  if (validationResult === true) return directory
  throw new InvalidArgumentError(validationResult)
})

export const newProjectDirectoryPrompt = async () => {
  return await input({
    message: 'Where should the project be created?',
    default: await generateDefaultName(),
    validate: async (path) => {
      return await validateDirectory(path)
    },
  })
}
