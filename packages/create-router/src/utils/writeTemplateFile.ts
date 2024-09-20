import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'

export async function writeTemplateFile(
  file: string,
  targetFolder: string,
  content: unknown,
) {
  const targetPath = resolve(targetFolder, file)
  let contentToWrite: string
  if (typeof content === 'string') {
    contentToWrite = content
  } else {
    contentToWrite = JSON.stringify(content, null, 2)
  }
  await writeFile(targetPath, contentToWrite)
}
