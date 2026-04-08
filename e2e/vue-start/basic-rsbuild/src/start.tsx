import { createStart } from '@tanstack/vue-start'

export const startInstance = createStart(() => ({
  defaultSsr: true,
}))
