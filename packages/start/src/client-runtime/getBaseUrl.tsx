export function getBaseUrl(base: string | undefined, id: string, name: string) {
  return `${base}/_server/?_serverFnId=${encodeURI(id)}&_serverFnName=${encodeURI(name)}`
}
