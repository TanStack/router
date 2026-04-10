import { pathToFileURL } from 'node:url'
import { tsImport } from 'tsx/esm/api'

export async function loadConfigFile(filePath: string): Promise<any> {
  const fileURL = pathToFileURL(filePath).href
  const loaded = await tsImport(fileURL, './')
  return loaded
}
