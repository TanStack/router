import path, { resolve } from 'node:path'
import fs, { access, readdir } from 'node:fs/promises'

export const checkFileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

export const checkFolderExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

export const checkFolderIsEmpty = async (path: string): Promise<boolean> => {
  try {
    const files = await readdir(path)
    return files.length === 0
  } catch {
    return false
  }
}
