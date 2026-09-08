import type { ServerFnCodec } from './serverFnCodecLoader'

let pending: Promise<ServerFnCodec> | undefined

export function loadServerFnCodec(): Promise<ServerFnCodec> {
  return (pending ??= import('./serverFnCodec').catch((error) => {
    pending = undefined
    throw error
  }))
}
