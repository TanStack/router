/* eslint-disable no-var */
declare global {
  var TSS_ROUTES_MANIFEST: Record<
    string,
    {
      filePath: string
      /** The real path of a symlinked route file. */
      realFilePath?: string
      children?: Array<string>
    }
  >
  var TSS_PRERENDABLE_PATHS: Array<{ path: string }> | undefined
}
export {}
