import path from 'pathe'

type RouteTreeModuleDeclarationOptions = {
  generatedRouteTreePath: string
  routerFilePath: string
  framework: string
  startFilePath?: string
}

/**
 * Resolve an import path from the generated route tree file to an absolute file path.
 */
function getImportPath(
  generatedRouteTreePath: string,
  absolutePath: string,
): string {
  let relativePath = path.relative(path.dirname(generatedRouteTreePath), absolutePath)

  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`
  }

  // Use POSIX import separators for generated module declarations.
  return relativePath.split(path.sep).join('/')
}

/**
 * Build the framework-specific Register module augmentation appended to route trees.
 */
export function createRouteTreeModuleDeclaration(
  options: RouteTreeModuleDeclarationOptions,
): string {
  const result: Array<string> = [
    `import type { getRouter } from '${getImportPath(options.generatedRouteTreePath, options.routerFilePath)}'`,
  ]

  if (options.startFilePath) {
    result.push(
      `import type { startInstance } from '${getImportPath(options.generatedRouteTreePath, options.startFilePath)}'`,
    )
  } else {
    result.push(
      `import type { createStart } from '@tanstack/${options.framework}-start'`,
    )
  }

  result.push(
    `declare module '@tanstack/${options.framework}-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>`,
  )

  if (options.startFilePath) {
    result.push(
      `    config: Awaited<ReturnType<typeof startInstance.getOptions>>`,
    )
  }

  result.push(`  }
}`)

  return result.join('\n')
}
