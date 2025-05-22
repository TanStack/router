declare module 'tanstack-start-router-manifest:v' {
  import type { Manifest } from '@tanstack/router-core'

  export const tsrStartManifest: () => Manifest
}

declare module 'tanstack-start-server-fn-manifest:v' {
  export default {} as Record<
    string,
    {
      functionName: string
      extractedFilename: string
      importer: () => Promise<any>
    }
  >
}
