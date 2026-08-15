/** Optional peer — present only when the app installs Tailwind. */
declare module '@tailwindcss/node' {
  export function compile(
    css: string,
    options: {
      base: string
      from?: string
      onDependency: (path: string) => void
    },
  ): Promise<{
    build: (candidates: Array<string>) => string
  }>
}
