declare module 'tanstack:start-manifest' {
  import type { Manifest } from '@tanstack/router-core'

  export const tsrStartManifest: () => Manifest
}

declare module 'tanstack-server-fn-manifest:module' {
  export default {} as Record<
    string,
    {
      functionName: string
      extractedFilename: string
      importer: () => Promise<any>
    }
  >
}
