const MINIMUM_SUPPORTED_VITE_MAJOR = 7

/**
 * TanStack Start relies on the `buildApp` plugin hook, which Vite only
 * invokes since v7. On older Vite versions (e.g. v6) the build appears to
 * succeed, but post-build steps such as prerendering and SPA shell
 * generation are silently skipped.
 * Fail fast with an actionable error instead.
 * see https://github.com/TanStack/router/issues/7918
 */
export function assertSupportedViteVersion(viteVersion: string): void {
  const major = Number.parseInt(viteVersion.split('.')[0]!, 10)

  if (Number.isNaN(major) || major >= MINIMUM_SUPPORTED_VITE_MAJOR) {
    return
  }

  throw new Error(
    `TanStack Start requires Vite v${MINIMUM_SUPPORTED_VITE_MAJOR}.0.0 or newer, but Vite v${viteVersion} was detected. ` +
      `Older Vite versions do not invoke the \`buildApp\` plugin hook, so post-build steps such as prerendering and SPA shell generation would be silently skipped. ` +
      `Please upgrade the "vite" dependency to >=${MINIMUM_SUPPORTED_VITE_MAJOR}.0.0.`,
  )
}
