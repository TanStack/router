import { ActionContext } from '@tanstack/react-actions'
import { loaderClient } from './loaderClient'

export const actionContext = new ActionContext<{
  loaderClient: typeof loaderClient
}>()
