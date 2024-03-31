/// <reference types="vinxi/types/server" />
import { eventHandler, toWebRequest } from 'vinxi/http'
import { handleRequest } from '../server-fns/handler'

export default eventHandler(handleServerAction) as any

export async function handleServerAction(event: any) {
  const request = toWebRequest(event)
  return await handleRequest(request)
}
