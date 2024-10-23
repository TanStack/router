import { tsImport } from 'tsx/esm/api'

export async function loadConfigFile(filePath: string) {
  const loaded = await tsImport(filePath, './')
  return loaded
}
