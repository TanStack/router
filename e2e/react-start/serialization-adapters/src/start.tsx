import { createStart } from '@tanstack/react-start'
import { carAdapter, fooAdapter } from './data'
import { customErrorAdapter } from './CustomError'

export const startInstance = createStart(() => {
  return {
    defaultSsr: true,
    serializationAdapters: [fooAdapter, carAdapter, customErrorAdapter],
  }
})
