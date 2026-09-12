import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'

export const readOnlyOnServer = createServerOnlyFn(() => 'Read on the server')

export const readThroughRpc = createServerFn().handler(() => readOnlyOnServer())
