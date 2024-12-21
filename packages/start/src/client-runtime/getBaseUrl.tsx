function sanitizeBase(base: string | undefined) {
  if (!base) {
    throw new Error(
      '🚨 process.env.TSS_SERVER_BASE is required in start/client-runtime/getBaseUrl',
    )
  }

  // remove the leading and trailing slash
  return base.replace(/^\/|\/$/g, '')
}

export function getBaseUrl(base: string | undefined, functionId: string) {
  return `${base}/${sanitizeBase(process.env.TSS_SERVER_BASE)}/${encodeURI(functionId)}`
}
