// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./tanstack-start.d.ts" />

export {
  createSolidStartHandler,
  createSolidStartHandler as createStartHandler,
} from './createSolidStartHandler'
export { handleSolidServerFunctionRequest } from './server-functions-handler'
export type { HandleSolidServerFunctionRequestOptions } from './server-functions-handler'
export * from '@tanstack/solid-start-server'
