import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { HEADER_CARRIER, MISSING } from './deployment-metadata.config'

export const readCarrierPost = createServerFn({ method: 'POST' }).handler(
  () => getRequestHeader(HEADER_CARRIER) ?? MISSING,
)

export const readCarrierGet = createServerFn({ method: 'GET' })
  .validator((data: { id: number }) => data)
  .handler(() => getRequestHeader(HEADER_CARRIER) ?? MISSING)
