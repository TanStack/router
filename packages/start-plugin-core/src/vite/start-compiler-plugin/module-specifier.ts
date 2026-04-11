import type { DevServerFnModuleSpecifierEncoder } from '../../start-compiler/types'

export function createViteDevServerFnModuleSpecifierEncoder(
  root: string,
): DevServerFnModuleSpecifierEncoder {
  const rootWithTrailingSlash = root.endsWith('/') ? root : `${root}/`

  return ({ extractedFilename }) => {
    let file = extractedFilename

    if (file.startsWith(rootWithTrailingSlash)) {
      file = file.slice(rootWithTrailingSlash.length)
    }

    return `/@id/${file}`
  }
}

export function decodeViteDevServerModuleSpecifier(
  moduleSpecifier: string,
): string {
  let sourceFile = moduleSpecifier

  if (sourceFile.startsWith('/@id/')) {
    sourceFile = sourceFile.slice('/@id/'.length)
  }

  const queryIndex = sourceFile.indexOf('?')

  return queryIndex === -1 ? sourceFile : sourceFile.slice(0, queryIndex)
}
