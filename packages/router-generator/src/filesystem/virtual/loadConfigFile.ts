import { tsImport } from 'tsx/esm/api'

export async function loadConfigFile(filePath: string) {
  const loaded = await tsImport(filePath, import.meta.url)
  return loaded
}
