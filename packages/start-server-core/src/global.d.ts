declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TSS_ROUTER_BASEPATH: string
      TSS_SERVER_FN_BASE: string
      TSS_CLIENT_OUTPUT_DIR?: string
      TSS_SHELL?: 'true' | 'false'
      TSS_PRERENDERING?: 'true' | 'false'
      TSS_DEV_SERVER?: 'true' | 'false'
    }
  }
}

export {}
