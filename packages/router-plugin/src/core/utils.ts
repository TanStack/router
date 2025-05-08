import { isAbsolute, join, normalize } from 'node:path'

export const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'router-plugin'].includes(process.env.TSR_VITE_DEBUG)

export function fileIsInRoutesDirectory(
  filePath: string,
  routesDirectory: string,
): boolean {
  const routesDirectoryPath = isAbsolute(routesDirectory)
    ? routesDirectory
    : join(process.cwd(), routesDirectory)

  const path = normalize(filePath)

  return path.startsWith(routesDirectoryPath)
}
