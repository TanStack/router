/* eslint-disable no-var */
declare global {
  var TSS_INJECTED_HEAD_SCRIPTS: string | undefined

  namespace NodeJS {
    interface ProcessEnv {
      TSS_APP_BASE?: string
      TSS_SERVER_FN_BASE?: string
      TSS_OUTPUT_PUBLIC_DIR?: string
      TSS_SHELL?: 'true' | 'false'
      TSS_PRERENDERING?: 'true' | 'false'
    }
  }
}

export {}
