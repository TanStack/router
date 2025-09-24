import { createStart } from '@tanstack/react-start'

import { foo } from '@some/lib'
export const startInstance = createStart(() => {})

export const someServerFn = startInstance.createServerFn().handler(() => {
  console.log('server mw')
  foo()
})
