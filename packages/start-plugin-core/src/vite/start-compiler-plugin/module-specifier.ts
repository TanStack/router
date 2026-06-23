import type {
  DevServerFnModuleSpecifierEncoder,
  ServerFn,
} from '../../start-compiler/types'

export type ViteDevServerFnImport = {
  file: string
  export: string
}

export function createViteDevServerFnModuleSpecifierEncoder(
  root: string,
): DevServerFnModuleSpecifierEncoder {
  const normalizedRoot = root.replace(/\\/g, '/')
  const rootWithTrailingSlash = normalizedRoot.endsWith('/')
    ? normalizedRoot
    : `${normalizedRoot}/`

  return ({ extractedFilename }) => {
    const normalizedFile = extractedFilename.replace(/\\/g, '/')

    if (normalizedFile.startsWith(rootWithTrailingSlash)) {
      return `/${normalizedFile.slice(rootWithTrailingSlash.length)}`
    }

    return normalizedFile.startsWith('/')
      ? `/@fs${normalizedFile}`
      : `/@fs/${normalizedFile}`
  }
}

export function decodeViteDevServerModuleSpecifier(
  moduleSpecifier: string,
): string {
  let sourceFile = moduleSpecifier

  if (sourceFile.startsWith('/@id/')) {
    sourceFile = sourceFile.slice('/@id/'.length)
  } else if (sourceFile.startsWith('/@fs/')) {
    sourceFile = sourceFile.slice('/@fs'.length)
    sourceFile = sourceFile.replace(/^\/([A-Za-z]:\/)/, '$1')
  } else if (sourceFile.startsWith('/')) {
    sourceFile = sourceFile.slice(1)
  }

  const queryIndex = sourceFile.indexOf('?')

  return queryIndex === -1 ? sourceFile : sourceFile.slice(0, queryIndex)
}

export function getViteDevServerFnImport(
  id: string,
  serverFnsById: Record<string, ServerFn>,
): ViteDevServerFnImport {
  const registeredServerFn = serverFnsById[id]
  if (registeredServerFn) {
    return {
      file: registeredServerFn.extractedFilename,
      export: registeredServerFn.functionName,
    }
  }

  try {
    const decoded = JSON.parse(Buffer.from(id, 'base64url').toString('utf8'))
    if (typeof decoded.file === 'string' && typeof decoded.export === 'string') {
      return {
        file: decoded.file,
        export: decoded.export,
      }
    }
  } catch {
    // Manual IDs are not encoded module references; fall through to registry lookup.
  }

  throw new Error(`Invalid server function ID: ${id}`)
}
