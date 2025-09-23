import { createStart } from '@tanstack/solid-start'

export const startInstance = createStart(() => {
  return {
    defaultSsr: true,
    serializationAdapters: [],
  }
})
