/* eslint-disable no-var */
declare global {
  var TSS_ROUTES_MANIFEST:
    | {
        routes: Record<
          string,
          {
            filePath: string
            children?: Array<string>
          }
        >
        hasServerRoutes?: boolean
      }
    | undefined
  var TSS_PRERENDABLE_PATHS: Array<{ path: string }> | undefined
}
export {}
