import { serverOnly as serverFn, clientOnly as clientFn } from '@tanstack/start'

const serverFunc = serverFn(() => 'server')

const clientFunc = clientFn(() => 'client')
