declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TSS_APP_BASE?: string
      TSS_SERVER_FN_BASE?: string
      TSS_CLIENT_OUTPUT_DIR?: string
      TSS_SHELL?: 'true' | 'false'
      TSS_PRERENDERING?: 'true' | 'false'
      TSS_DEV_SERVER?: 'true' | 'false'
    }
  }
}

export {}
