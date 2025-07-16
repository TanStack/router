import {
  serverOnly as serverFn,
  clientOnly as clientFn,
} from '@tanstack/react-start'

const serverFunc = serverFn(() => 'server')

const clientFunc = clientFn(() => 'client')
