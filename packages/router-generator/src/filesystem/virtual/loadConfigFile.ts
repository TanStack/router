import { createJiti } from 'jiti'

export async function loadConfigFile(filePath: string) {
  const jiti = createJiti(filePath, { interopDefault: false })
  const loaded = await jiti.import<any>(filePath)
  return loaded
}
