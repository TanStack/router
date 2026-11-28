import path from 'pathe'
import type { GetConfigFn, TanStackStartCoreOptions } from '../types'

function buildRouteTreeFileFooter(opts: {
  generatedRouteTreePath: string
  startFilePath: string | undefined
  routerFilePath: string
  framework: TanStackStartCoreOptions['framework']
  userFooter?: Array<string> | (() => Array<string>)
  quoteStyle: 'single' | 'double'
  semicolons: boolean
}): Array<string> {
  // (in the route tree's code style, like the generator's own output)
  const q = opts.quoteStyle === 'double' ? '"' : "'"
  const semi = opts.semicolons ? ';' : ''
  const quoted = (value: string) =>
    `${q}${value.replaceAll('\\', '\\\\').replaceAll(q, `\\${q}`)}${q}`

  function getImportPath(absolutePath: string) {
    let relativePath = path.relative(
      path.dirname(opts.generatedRouteTreePath),
      absolutePath,
    )

    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath
    }

    return relativePath.split(path.sep).join('/')
  }

  function appendFooterBlock(lines: Array<string>, block: string) {
    if (!block) {
      return
    }

    if (lines.length > 0) {
      lines[lines.length - 1] += `\n${block}`
      return
    }

    lines.push(block)
  }

  const footer: Array<string> = []

  appendFooterBlock(
    footer,
    `import type { getRouter } from ${quoted(getImportPath(opts.routerFilePath))}${semi}`,
  )

  if (opts.startFilePath) {
    appendFooterBlock(
      footer,
      `import type { startInstance } from ${quoted(getImportPath(opts.startFilePath))}${semi}`,
    )
  } else {
    appendFooterBlock(
      footer,
      `import type { createStart } from ${quoted(`@tanstack/${opts.framework}-start`)}${semi}`,
    )
  }

  appendFooterBlock(
    footer,
    `declare module ${quoted(`@tanstack/${opts.framework}-start`)} {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>`,
  )

  if (opts.startFilePath) {
    appendFooterBlock(
      footer,
      `    config: Awaited<ReturnType<typeof startInstance.getOptions>>`,
    )
  }

  appendFooterBlock(
    footer,
    `  }
}`,
  )

  if (opts.userFooter) {
    footer.push(
      ...(Array.isArray(opts.userFooter) ? opts.userFooter : opts.userFooter()),
    )
  }

  return footer
}

export function buildRouteTreeFileFooterFromConfig(opts: {
  generatedRouteTreePath: string
  getConfig: GetConfigFn
  corePluginOpts: TanStackStartCoreOptions
}): Array<string> {
  const { startConfig, resolvedStartConfig } = opts.getConfig()
  return buildRouteTreeFileFooter({
    generatedRouteTreePath: opts.generatedRouteTreePath,
    startFilePath: resolvedStartConfig.startFilePath,
    routerFilePath: resolvedStartConfig.routerFilePath,
    framework: opts.corePluginOpts.framework,
    userFooter: startConfig.router.routeTreeFileFooter,
    quoteStyle: startConfig.router.quoteStyle,
    semicolons: startConfig.router.semicolons,
  })
}
